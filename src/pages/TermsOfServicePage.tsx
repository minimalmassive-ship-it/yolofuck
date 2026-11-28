import React from 'react';
import { Link } from 'react-router-dom';
import { Scale } from 'lucide-react';
import { MemcutLegalLayout, MemcutLegalSectionLink } from '../components/legal/MemcutLegalLayout';
import { ObfuscatedEmail } from '../components/legal/ObfuscatedEmail';

const legalSections: readonly MemcutLegalSectionLink[] = [
  { id: 'overview', label: 'Overview & Scope' },
  { id: 'section-1', label: '01. Service Provider, UŚUDE & PWA' },
  { id: 'section-2', label: '02. Eligibility & Plasticin ID SSO' },
  { id: 'section-3', label: '03. Local IndexedDB & Cloud Sync' },
  { id: 'section-4', label: '04. Daily Stories, Quests & Image Rights' },
  { id: 'section-5', label: '05. BYOK Speech & AI Think Engines' },
  { id: 'section-6', label: '06. Ecosystem Chat, NanCat & MCP' },
  { id: 'section-7', label: '07. EU Data Act, DSA & DMCA' },
  { id: 'section-8', label: '08. Warranties, Liability & Law' },
];

export const TermsOfServicePage: React.FC = () => {
  return (
    <MemcutLegalLayout
      activeDoc="terms"
      badgeText="Official Legal Terms · EU / Poland / Global"
      badgeIcon={<Scale size={14} />}
      title="Terms of Service"
      effectiveDate="November 28, 2026"
      lastUpdated="November 28, 2026"
      version="Version 1.0 · Memcut Global & EU Agreement"
      statusPill="100% Creator Footage Ownership"
      summaryTitle="Key Rules for Daily Video Journaling, Local Storage & Cloud Sync"
      summaryBody={
        <p>
          <strong>Memcut</strong> (<code>memcut.com</code>) is operated by <strong>Arian Fazel</strong> from{' '}
          <strong>Bydgoszcz, Republic of Poland (EU)</strong> as part of the Plasticin ecosystem (<code>plasticin.com</code>).
          You retain 100% ownership over all recorded video takes, spoken transcripts, and Daily Stories.
          Users control whether takes stay strictly inside local device IndexedDB storage or sync via Supabase/Plasticin ID across devices, Friends, Community Quests, embedded Plasticin Chat, and NanCat media pipelines.
        </p>
      }
      sections={legalSections}
      footerContactTitle="Legal, DSA/DMCA & Consumer Inquiries"
      footerContactDescription="Direct statutory complaints (reklamacje), EU Data Act requests, or copyright takedown notices to"
      nextDoc={{ id: 'privacy', label: 'Privacy Policy' }}
    >
      <section id="section-1" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">01.</span> Service Provider, Polish UŚUDE &amp; PWA Requirements
        </h2>
        <p>
          These Terms of Service (<strong>&ldquo;Terms&rdquo;</strong>) constitute a binding agreement between you and <strong>Arian Fazel</strong>, operating <strong>Memcut</strong> (<code>memcut.com</code>) from{' '}
          <strong>Bydgoszcz, Republic of Poland (EU)</strong>, and serve as Regulations for Electronic Services (<em>Regulamin</em>) under Article 8 of the Polish Electronic Services Act (UŚUDE).
        </p>
        <p>
          Access requires an up-to-date mobile or desktop browser (or installed Progressive Web App / PWA) supporting HTML5 video/audio recording, WebCrypto, WebStorage, and optional camera/microphone permissions.
        </p>
      </section>

      <section id="section-2" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">02.</span> Eligibility, Plasticin ID SSO &amp; Account Security
        </h2>
        <p>
          You must be at least <strong>16 years of age</strong> (or higher digital-consent age under local law) to use Memcut. Sign-in is authenticated via <strong>Plasticin ID</strong> (OAuth 2.1 + PKCE S256) or authorized Google OAuth sessions. You safeguard your active tokens and connected account credentials at all times.
        </p>
      </section>

      <section id="section-3" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">03.</span> Local Device Mode (IndexedDB), Cloud Sync &amp; Soft-Delete Trash
        </h2>
        <ul>
          <li>
            <strong>Local Storage Only Mode:</strong> When enabled in Media Settings, recorded video blobs stay locally inside browser <code>IndexedDB</code> (<code>memcut_local_storage</code>) without uploading to remote cloud buckets. Browser eviction, device loss, or clearing site data permanently deletes unbacked local clips at your sole risk.
          </li>
          <li>
            <strong>Cloud Sync &amp; Realtime Devices:</strong> In standard synced mode, recorded takes, subtitles, and metadata store via Supabase PostgreSQL/Storage and broadcast synchronization updates via Supabase Realtime WebSockets across your active sessions.
          </li>
          <li>
            <strong>Trash Bin Recovery:</strong> Deleted items move to Trash Bin before irreversible deletion; expired or manually emptied items cannot be recovered.
          </li>
        </ul>
      </section>

      <section id="section-4" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">04.</span> Daily Stories (<code>/story/:slug</code>), Friends, Quests &amp; Recording Consent
        </h2>
        <div className="memcut-legal-alert">
          <strong>Mandatory Image Rights &amp; Anti-Wiretapping Duty:</strong> Users bear exclusive legal responsibility for obtaining informed consent before filming, recording audio of, or sharing clips depicting any identifiable person (under GDPR, Polish Civil Code Art. 23/81 image rights, and Criminal Code Art. 267). Covert surveillance or non-consensual filming is strictly prohibited.
        </div>
        <ul>
          <li>
            <strong>Visibility Scopes:</strong> Daily Stories may remain private, restricted to added Friends / Organization members, or shared publicly at <code>/story/:slug</code>. You may toggle story visibility to Stopped anytime in Share Command Center.
          </li>
          <li>
            <strong>Community Quests &amp; Ownership:</strong> You retain copyright over your clips. By marking a Story or Quest submission public, you grant Memcut a revocable, worldwide, royalty-free hosting license solely to stream and display the link to intended viewers.
          </li>
        </ul>
      </section>

      <section id="section-5" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">05.</span> Spoken-Word Listen STT &amp; Think AI BYOK Integrations
        </h2>
        <p>
          Background speech-to-text transcription and AI search analysis support either native browser speech recognition (Native Browser Web Speech API, executed locally/via your OS browser without storing third-party Memcut API keys) or customer-supplied <strong>Bring Your Own Key (BYOK)</strong> cloud credentials (explicit microphone/audio transmission opt-in to external vendor endpoints) for:
        </p>
        <ul>
          <li><strong>Listen (Speech-to-Text):</strong> Deepgram (<code>nova-2</code>), OpenAI Whisper, Groq Whisper, Gladia, and AssemblyAI (the web build does not execute local ONNX Whisper weights offline; select Native Browser Web Speech for zero third-party BYOK billing).</li>
          <li><strong>Think (AI Reasoning):</strong> Groq, Google Gemini, DeepSeek, and OpenRouter.</li>
        </ul>
        <p>
          Memcut never uses private user journals to train foundation models. Where you supply external BYOK keys, keys are encrypted locally on your device via WebCrypto AES-256-GCM (never persisted plaintext in cloud <code>profiles.settings</code>), and your separate contractual terms, fees, and API rate limits with those vendors govern inference execution. AI-generated summaries or transcripts may contain transcription inaccuracies and require human verification before legal or business reliance.
        </p>
      </section>

      <section id="section-6" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">06.</span> Embedded Plasticin Chat, NanCat Bridge &amp; Central MCP Gateway
        </h2>
        <ul>
          <li>
            <strong>Organization Directory &amp; Embedded Chat (<code>chat.plasticin.com</code>):</strong> Organization members may exchange messages and attachments across Management and Workspace chat rooms governed by our{' '}
            <Link to="/acceptable-use" className="memcut-legal-inline-link">Acceptable Use Policy</Link>.
          </li>
          <li>
            <strong>NanCat Short-Form Pipeline (<code>nancat.com</code>):</strong> Users may export or bridge selected journal takes into NanCat for editing and distribution under NanCat&apos;s publishing terms.
          </li>
          <li>
            <strong>External AI Agents via Central MCP Gateway:</strong> If you enable Memcut scopes inside Plasticin&apos;s Central MCP Gateway, external AI assistants (Claude, ChatGPT, Sesame, etc.) access your authorized recordings/transcripts at your sole risk, including third-party retention or automated prompt-injection actions.
          </li>
        </ul>
      </section>

      <section id="section-7" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">07.</span> EU Data Act, Digital Services Act (DSA) &amp; DMCA Notice
        </h2>
        <p>
          You may download your clips, stop public Story sharing, or request structured archive export and account exit under the <strong>EU Data Act (Regulation (EU) 2023/2854)</strong> via <ObfuscatedEmail preset="plasticin-support" subjectHint="Memcut Data Act Export" />. Public Story links (<code>/story/:slug</code>) are subject to DSA Art. 16–20 Notice-and-Action and DMCA takedowns addressed to <ObfuscatedEmail preset="plasticin-support" subjectHint="Memcut DSA / DMCA Notice" />.
        </p>
      </section>

      <section id="section-8" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">08.</span> Warranties, Limitation of Liability, Complaints &amp; Law
        </h2>
        <p>
          <strong>As-Is Delivery &amp; Liability Cap:</strong> Memcut is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; Mandatory liability under Polish/EU law for intentional misconduct, personal injury, and non-waivable Consumer rights remains preserved. Subject thereto, cumulative 12-month liability is capped at the greater of direct fees paid to Memcut or <strong>EUR 100</strong>. We accept zero liability for loss of client-only IndexedDB clips after cache clearance or device damage.
        </p>
        <p>
          <strong>Governing Law &amp; Complaints (Reklamacje):</strong> Governed by the laws of the <strong>Republic of Poland</strong> (excluding UN CISG). B2B disputes belong to courts in <strong>Bydgoszcz, Poland</strong>. Consumer complaints submitted to <ObfuscatedEmail preset="plasticin-support" subjectHint="Memcut Consumer Complaint" /> are answered within <strong>14 calendar days</strong>, with EU Consumers retaining local court and Polish Trade Inspection / UOKiK ADR rights.
        </p>
      </section>
    </MemcutLegalLayout>
  );
};
