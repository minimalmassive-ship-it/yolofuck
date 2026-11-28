import React from 'react';
import { FileCheck2 } from 'lucide-react';
import { MemcutLegalLayout, MemcutLegalSectionLink } from '../components/legal/MemcutLegalLayout';
import { ObfuscatedEmail } from '../components/legal/ObfuscatedEmail';

const legalSections: readonly MemcutLegalSectionLink[] = [
  { id: 'overview', label: 'Overview & GDPR Art. 28 Scope' },
  { id: 'section-1', label: '01. Roles, Instructions & Organization Workspaces' },
  { id: 'section-2', label: '02. Technical & Organizational Security' },
  { id: 'section-3', label: '03. Subprocessors, BYOK STT & MCP Boundary' },
  { id: 'section-4', label: '04. Breaches, Audits & Exit Deletion' },
];

export const DpaPage: React.FC = () => {
  return (
    <MemcutLegalLayout
      activeDoc="dpa"
      badgeText="GDPR Article 28 · Standard Contractual Clauses · B2B Schedule"
      badgeIcon={<FileCheck2 size={14} />}
      title="Data Processing Addendum (DPA)"
      effectiveDate="November 28, 2026"
      lastUpdated="November 28, 2026"
      version="Version 1.0 · Memcut Organization DPA"
      statusPill="Art. 28 Binding Schedule"
      summaryTitle="Enterprise Data Protection for Team Video Journals &amp; Shared Organizations"
      summaryBody={
        <p>
          This Data Processing Addendum governs Organization-level video journals, team chat rooms, and member permissions synced via Plasticin ID inside <strong>memcut.com</strong>. Customer remains Data Controller; <strong>Arian Fazel (Bydgoszcz, Poland)</strong> acts as Data Processor under GDPR Art. 28.
        </p>
      }
      sections={legalSections}
      footerContactTitle="DPA Execution & Compliance Documentation"
      footerContactDescription="Request signed B2B DPA schedules or subprocessor notices via"
      nextDoc={{ id: 'acceptable-use', label: 'Acceptable Use & Capture Policy' }}
    >
      <section id="section-1" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">01.</span> Roles, Subject Matter &amp; Documented Instructions
        </h2>
        <p>
          Memcut processes team journal recordings, searchable spoken transcripts, Organization chat messages/attachments, and member rosters strictly upon Customer instructions initiated through UI settings, share commands, and Plasticin Directory synchronization until Organization deletion.
        </p>
      </section>

      <section id="section-2" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">02.</span> Technical &amp; Organizational Security Measures (GDPR Art. 32)
        </h2>
        <ul>
          <li><strong>Row-Level Security &amp; Tenant Isolation:</strong> PostgreSQL RLS hardening isolating organization IDs and user UUIDs.</li>
          <li><strong>Transport &amp; Input Sanitation:</strong> TLS encryption, PKCE S256 OAuth login, safe URL/text sanitization, and optional zero-upload client-side IndexedDB capture.</li>
          <li><strong>Confidentiality:</strong> Authorized systems personnel remain bound by strict statutory/contractual secrecy obligations.</li>
        </ul>
      </section>

      <section id="section-3" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">03.</span> Authorized Subprocessors vs. Customer BYOK &amp; MCP Agents
        </h2>
        <p>
          Core infrastructure subprocessors (<strong>Supabase, Vercel, Cloudflare, Plasticin Core</strong>) operate under GDPR Art. 28(4) flow-down terms and 2021 EU SCCs where applicable. When Customers supply BYOK keys (Deepgram, Groq, Gemini, DeepSeek, OpenRouter, OpenAI, Gladia, AssemblyAI) or authorize external MCP AI agents via Plasticin Gateway, those third-party providers operate directly on Customer&apos;s own instructions and contractual accounts.
        </p>
      </section>

      <section id="section-4" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">04.</span> Breach Notification &amp; EU Data Act Exit
        </h2>
        <p>
          Confirmed security incidents impacting Customer Personal Data are notified within <strong>48 hours</strong>. Upon exit, Customers may download media/transcripts and request irreversible account deletion via <ObfuscatedEmail preset="plasticin-support" subjectHint="Memcut DPA Exit Request" />.
        </p>
      </section>
    </MemcutLegalLayout>
  );
};
