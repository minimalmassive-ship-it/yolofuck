/**
 * AuthCallbackPage.tsx — Memcut
 * Standard OAuth 2.1 PKCE Callback Handler for Central Plasticin ID Authentication
 * Strictly Neumorphic Dark styling with ZERO purple/pink hues.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import { handlePlasticinCallback, initiatePlasticinSso } from '../lib/plasticinSso';

export const AuthCallbackPage: React.FC = () => {
    const [status, setStatus] = useState<'loading' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let isCancelled = false;

        const processCallback = async () => {
            try {
                await handlePlasticinCallback();
                if (!isCancelled) {
                    // Seamlessly navigate to Journal once authenticated
                    window.location.href = '/journal';
                }
            } catch (err: any) {
                console.error('[SSO Callback] Authorization exchange error:', err);
                if (!isCancelled) {
                    setStatus('error');
                    setErrorMessage(err?.message || 'Failed to complete Plasticin authorization.');
                }
            }
        };

        processCallback();

        return () => {
            isCancelled = true;
        };
    }, []);

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: '#12110F',
            color: '#F5F5F4',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            zIndex: 9999,
            userSelect: 'none',
        }}>
            {/* Centered Brand Handshake Card */}
            <div style={{
                width: '100%',
                maxWidth: '420px',
                background: '#1C1B18',
                border: '1px solid #33312C',
                borderRadius: '24px',
                padding: '36px 28px',
                textAlign: 'center',
                boxShadow: '0 24px 60px -15px rgba(0, 0, 0, 0.85)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '18px',
            }}>
                {/* Dual Branding Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                        src="/assets/plasticin_icon.png"
                        alt="Plasticin"
                        style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <span style={{ color: '#78716C', fontSize: '13px' }}>&times;</span>
                    <img
                        src="/memcut-glyph.png"
                        alt="Memcut"
                        style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                    />
                </div>

                {status === 'loading' ? (
                    <>
                        <Loader2 size={32} className="vizja-spin" style={{ color: '#C8F931', marginTop: '6px' }} />
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: '#F5F5F4' }}>
                                Connecting to Memcut
                            </h2>
                            <p style={{ fontSize: '12px', color: '#A8A29E', margin: 0, lineHeight: 1.5 }}>
                                Finalizing your unified Plasticin ID session and preparing your journal...
                            </p>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#F87171',
                            marginTop: '4px',
                        }}>
                            <AlertCircle size={22} />
                        </div>
                        <div>
                            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: '#F87171' }}>
                                Authorization Notice
                            </h2>
                            <p style={{ fontSize: '12px', color: '#A8A29E', margin: 0, lineHeight: 1.5 }}>
                                {errorMessage}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={() => initiatePlasticinSso({ mode: 'signin' })}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 18px',
                                    borderRadius: '12px',
                                    background: '#10b981',
                                    border: '1px solid #059669',
                                    color: '#000000',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <span>Sign In with Plasticin</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => { window.location.href = '/'; }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 18px',
                                    borderRadius: '12px',
                                    background: '#21201D',
                                    border: '1px solid #33312C',
                                    color: '#A8A29E',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                <ArrowLeft size={14} />
                                <span>Return to Home</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthCallbackPage;
