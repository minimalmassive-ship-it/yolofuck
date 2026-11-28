import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  FileDown,
  Globe,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { ObfuscatedEmail } from './ObfuscatedEmail';
import './MemcutLegalLayout.css';

export type MemcutLegalDocId =
  | 'terms'
  | 'privacy'
  | 'cookies'
  | 'dpa'
  | 'acceptable-use';

export interface MemcutLegalSectionLink {
  id: string;
  label: string;
}

interface MemcutDocMeta {
  id: MemcutLegalDocId;
  route: string;
  shortTitle: string;
}

const memcutLegalDocs: readonly MemcutDocMeta[] = [
  { id: 'terms', route: '/terms', shortTitle: 'Terms of Service' },
  { id: 'privacy', route: '/privacy', shortTitle: 'Privacy Policy' },
  { id: 'cookies', route: '/cookies', shortTitle: 'Cookie & Local Storage Policy' },
  { id: 'dpa', route: '/dpa', shortTitle: 'Data Processing Addendum (DPA)' },
  { id: 'acceptable-use', route: '/acceptable-use', shortTitle: 'Acceptable Use & Capture Policy' },
];

export interface MemcutLegalLayoutProps {
  activeDoc: MemcutLegalDocId;
  badgeText: string;
  badgeIcon: React.ReactNode;
  title: string;
  effectiveDate: string;
  lastUpdated: string;
  version: string;
  statusPill: string;
  summaryTitle: string;
  summaryBody: React.ReactNode;
  sections: readonly MemcutLegalSectionLink[];
  footerContactTitle: string;
  footerContactDescription: string;
  nextDoc: { id: MemcutLegalDocId; label: string };
  children: React.ReactNode;
}

export const MemcutLegalLayout: React.FC<MemcutLegalLayoutProps> = ({
  activeDoc,
  badgeText,
  badgeIcon,
  title,
  effectiveDate,
  lastUpdated,
  version,
  statusPill,
  summaryTitle,
  summaryBody,
  sections,
  footerContactTitle,
  footerContactDescription,
  nextDoc,
  children,
}) => {
  const navigate = useNavigate();
  const [activeSectionId, setActiveSectionId] = useState<string>(sections[0]?.id || 'overview');
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    try {
      const saved = window.localStorage.getItem('memcut_legal_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('memcut_legal_theme', themeMode);
      window.dispatchEvent(new CustomEvent('memcut-theme-changed', { detail: { theme: themeMode } }));
    } catch {
      // Ignore storage error
    }
  }, [themeMode]);

  const handleNavigateDoc = (docId: MemcutLegalDocId) => {
    const target = memcutLegalDocs.find((d) => d.id === docId);
    if (target) {
      navigate(target.route);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePrintPdf = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const currentDocTitle = memcutLegalDocs.find((d) => d.id === activeDoc)?.shortTitle || title;

  return (
    <div className="memcut-legal-root" data-memcut-legal-theme={themeMode}>
      <div className="memcut-legal-shell">
        <div className="memcut-legal-topbar">
          <div className="memcut-legal-breadcrumb">
            <button type="button" onClick={() => navigate('/')} className="memcut-legal-back-btn">
              <ArrowLeft size={14} />
              <span>Back to Memcut</span>
            </button>
            <ChevronRight size={14} />
            <span>Legal</span>
            <ChevronRight size={14} />
            <span>{currentDocTitle}</span>
          </div>

          <div className="memcut-legal-topbar-actions">
            <button
              type="button"
              onClick={() => setThemeMode((m) => (m === 'dark' ? 'light' : 'dark'))}
              className="memcut-legal-theme-btn"
              title="Toggle Light / Dark theme"
            >
              {themeMode === 'dark' ? (
                <>
                  <Sun size={14} />
                  <span>Light Theme</span>
                </>
              ) : (
                <>
                  <Moon size={14} />
                  <span>Dark Theme</span>
                </>
              )}
            </button>

            <button type="button" onClick={handlePrintPdf} className="memcut-legal-pdf-btn">
              <FileDown size={14} />
              <span>Download / Print PDF</span>
            </button>
          </div>
        </div>

        <div className="memcut-legal-mobile-nav">
          <div className="memcut-legal-mobile-pills">
            {memcutLegalDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => handleNavigateDoc(doc.id)}
                className={`memcut-legal-mobile-pill ${
                  doc.id === activeDoc ? 'memcut-legal-mobile-pill--active' : ''
                }`}
              >
                {doc.shortTitle}
              </button>
            ))}
          </div>
          <div className="memcut-legal-mobile-select-row">
            <label htmlFor={`memcut-mobile-sec-${activeDoc}`}>Jump to:</label>
            <select
              id={`memcut-mobile-sec-${activeDoc}`}
              value={activeSectionId}
              onChange={(e) => handleJumpToSection(e.target.value)}
              className="memcut-legal-mobile-select"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="memcut-legal-grid">
          <aside className="memcut-legal-sidebar" aria-label="Legal Documentation Navigation">
            <div className="memcut-legal-sidebar-title">Legal</div>
            <ul className="memcut-legal-doc-list">
              {memcutLegalDocs.map((doc) => {
                const isCurrent = doc.id === activeDoc;
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => handleNavigateDoc(doc.id)}
                      className={`memcut-legal-doc-btn ${
                        isCurrent ? 'memcut-legal-doc-btn--active' : ''
                      }`}
                    >
                      <span className="memcut-legal-doc-dot" />
                      <span>{doc.shortTitle}</span>
                    </button>

                    {isCurrent && sections.length > 0 && (
                      <ul className="memcut-legal-toc">
                        {sections.map((sec) => (
                          <li key={sec.id}>
                            <button
                              type="button"
                              onClick={() => handleJumpToSection(sec.id)}
                              className={`memcut-legal-toc-btn ${
                                activeSectionId === sec.id ? 'memcut-legal-toc-btn--active' : ''
                              }`}
                            >
                              {sec.label}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="memcut-legal-sidebar-meta">
              <strong>Jurisdiction &amp; Contact</strong>
              <span>Bydgoszcz, Republic of Poland (EU)</span>
              <ObfuscatedEmail preset="plasticin-support" />
            </div>
          </aside>

          <main>
            <header id="overview" className="memcut-legal-header">
              <div className="memcut-legal-badge">
                {badgeIcon}
                <span>{badgeText}</span>
              </div>
              <h1 className="memcut-legal-title">{title}</h1>
              <div className="memcut-legal-meta-row">
                <span className="memcut-legal-meta-item">
                  <Calendar size={13} />
                  Effective: {effectiveDate}
                </span>
                <span className="memcut-legal-meta-item">
                  <Calendar size={13} />
                  Last Updated: {lastUpdated}
                </span>
                <span className="memcut-legal-meta-item">
                  <Globe size={13} />
                  {version}
                </span>
                <span className="memcut-legal-status-pill">{statusPill}</span>
              </div>
            </header>

            <div className="memcut-legal-summary">
              <div className="memcut-legal-summary-title">
                <ShieldCheck size={16} />
                <span>{summaryTitle}</span>
              </div>
              {summaryBody}
            </div>

            <div className="memcut-legal-body">{children}</div>

            <div className="memcut-legal-footer-card">
              <div>
                <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
                  {footerContactTitle}
                </div>
                <div style={{ fontSize: '12px', opacity: 0.9 }}>
                  {footerContactDescription} <ObfuscatedEmail preset="plasticin-support" showCopy />
                </div>
                <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '4px' }}>
                  General inquiries: <ObfuscatedEmail preset="plasticin-contact" /> &middot; Bydgoszcz, Republic of Poland (EU)
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleNavigateDoc(nextDoc.id)}
                className="memcut-legal-next-btn"
              >
                {nextDoc.label} &rarr;
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
