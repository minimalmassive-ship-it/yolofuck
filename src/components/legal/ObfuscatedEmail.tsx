import React, { useState, useSyncExternalStore } from 'react';
import { Check, Copy, Mail } from 'lucide-react';

type MemcutEmailPreset = 'plasticin-support' | 'plasticin-contact';

const userCharCodes: Record<MemcutEmailPreset, readonly number[]> = {
  'plasticin-support': [115, 117, 112, 112, 111, 114, 116],
  'plasticin-contact': [99, 111, 110, 116, 97, 99, 116],
};

const domainCharCodes: Record<MemcutEmailPreset, readonly number[]> = {
  'plasticin-support': [112, 108, 97, 115, 116, 105, 99, 105, 110, 46, 99, 111, 109],
  'plasticin-contact': [112, 108, 97, 115, 116, 105, 99, 105, 110, 46, 99, 111, 109],
};

function decodeCharCodes(codes: readonly number[]): string {
  return String.fromCharCode(...codes);
}

const emptySubscribe = () => () => {};

export interface ObfuscatedEmailProps {
  preset?: MemcutEmailPreset;
  showCopy?: boolean;
  showIcon?: boolean;
  subjectHint?: string;
  label?: string;
}

export const ObfuscatedEmail: React.FC<ObfuscatedEmailProps> = ({
  preset = 'plasticin-support',
  showCopy = false,
  showIcon = false,
  subjectHint,
  label,
}) => {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [copied, setCopied] = useState(false);

  const user = decodeCharCodes(userCharCodes[preset]);
  const domain = decodeCharCodes(domainCharCodes[preset]);
  const atSign = String.fromCharCode(64);
  const mailScheme = `${String.fromCharCode(109, 97, 105, 108, 116, 111)}:`;

  const handleOpenMail = () => {
    if (typeof window === 'undefined') return;
    const query = subjectHint ? `?subject=${encodeURIComponent(subjectHint)}` : '';
    window.location.href = `${mailScheme}${user}${atSign}${domain}${query}`;
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(`${user}${atSign}${domain}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  if (!mounted) {
    return (
      <span className="memcut-obfuscated-static">
        {label || `${user} [at] ${domain.replace('.', ' [dot] ')}`}
      </span>
    );
  }

  return (
    <span className="memcut-obfuscated-wrap">
      <button
        type="button"
        onClick={handleOpenMail}
        aria-label={`Compose email to ${user} at ${domain}`}
        className="memcut-obfuscated-btn"
      >
        {showIcon && <Mail size={13} />}
        {label ? (
          <span>{label}</span>
        ) : (
          <>
            <span>{user}</span>
            <span aria-hidden="true">{atSign}</span>
            <span>{domain}</span>
          </>
        )}
      </button>
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          title="Copy email address"
          aria-label="Copy email address"
          className="memcut-obfuscated-copy"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}
      <noscript>
        <span>
          {user} [at] {domain.replace('.', ' [dot] ')}
        </span>
      </noscript>
    </span>
  );
};
