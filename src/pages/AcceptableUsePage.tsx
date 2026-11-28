import React from 'react';
import { Ban } from 'lucide-react';
import { MemcutLegalLayout, MemcutLegalSectionLink } from '../components/legal/MemcutLegalLayout';
import { ObfuscatedEmail } from '../components/legal/ObfuscatedEmail';

const legalSections: readonly MemcutLegalSectionLink[] = [
  { id: 'overview', label: 'Overview & Recording Ethics' },
  { id: 'section-1', label: '01. Consent Before Filming & Covert Recording Ban' },
  { id: 'section-2', label: '02. Public Stories (/story/:slug), Quests & DSA' },
  { id: 'section-3', label: '03. Security, BYOK & MCP Gateway Integrity' },
];

export const AcceptableUsePage: React.FC = () => {
  return (
    <MemcutLegalLayout
      activeDoc="acceptable-use"
      badgeText="Participant Consent · Polish Penal Code Art. 267 · DSA · EU AI Act"
      badgeIcon={<Ban size={14} />}
      title="Acceptable Use &amp; Capture Policy"
      effectiveDate="November 28, 2026"
      lastUpdated="November 28, 2026"
      version="Version 1.0 · Binding Creator & Community Rules"
      statusPill="Zero-Covert Recording"
      summaryTitle="Consent-First Filming, Public Story Safety &amp; Zero Abuse"
      summaryBody={
        <p>
          Memcut empowers personal and team spoken-word video journaling. Covert wiretapping, non-consensual filming, unlawful distribution of private recordings, and security probing against Supabase/Plasticin endpoints are strictly banned and trigger immediate account termination.
        </p>
      }
      sections={legalSections}
      footerContactTitle="Abuse, Privacy Violation &amp; DSA Reports"
      footerContactDescription="Report non-consensual Stories (/story/:slug), DMCA claims, or security flaws to"
      nextDoc={{ id: 'terms', label: 'Terms of Service' }}
    >
      <section id="section-1" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">01.</span> Mandatory Filming Consent &amp; Anti-Wiretapping Law
        </h2>
        <ul>
          <li>
            <strong>No Secret Audio/Video Wiretapping:</strong> Using Memcut&apos;s quick 9:16 mobile hold-to-record capture to secretly record private conversations or meetings without legal consent (including Polish Criminal Code Art. 267 and applicable two-party consent jurisdictions) is strictly prohibited.
          </li>
          <li>
            <strong>Respect Image Rights:</strong> Never share recordings depicting third parties, minors, or confidential workplace whiteboards publicly via Friends, Organization Chat, or <code>/story/:slug</code> without documented permission.
          </li>
        </ul>
      </section>

      <section id="section-2" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">02.</span> Zero-Tolerance Content, Public Stories &amp; DSA Notice-and-Action
        </h2>
        <p>
          Uploading, sharing via Quest submissions, or transmitting via embedded Chat any CSAM, non-consensual intimate content, doxxing, harassment, malware, copyrighted film piracy, or AI systems prohibited under EU AI Act Art. 5 results in immediate removal and permanent account ban. Under EU Digital Services Act (DSA) Articles 16–20, moderation notices include a Statement of Reasons and free 6-month appeal rights via <ObfuscatedEmail preset="plasticin-support" subjectHint="Memcut Moderation Appeal" />.
        </p>
      </section>

      <section id="section-3" className="memcut-legal-section">
        <h2>
          <span className="memcut-legal-num">03.</span> Platform Security, BYOK Keys &amp; MCP Limits
        </h2>
        <p>
          Probing Supabase Row-Level Security boundaries, forging Plasticin OAuth/SSO tokens, spoofing Story slugs, scraping public profiles, injecting prompt-injection strings into transcripts for connected MCP AI agents, or using unauthorized third-party STT/LLM API keys is strictly forbidden. Disclose good-faith security vulnerabilities privately to <ObfuscatedEmail preset="plasticin-support" subjectHint="Memcut Security Vulnerability" />.
        </p>
      </section>
    </MemcutLegalLayout>
  );
};
