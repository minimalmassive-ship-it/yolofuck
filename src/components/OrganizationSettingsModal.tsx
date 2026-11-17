import React, { useState, useEffect } from 'react';
import { Building2, X, AlertCircle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    PlatformPlasticinOrgId,
    fetchPlasticinDirectoryDetail,
    publishOrganizationUpdateToEcosystem,
    resolveCanonicalPlasticinOrgId,
    sanitizeOrgDescription,
    sanitizeOrgName,
} from '../lib/ecosystemOrgSync';

interface OrganizationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const OrganizationSettingsModal: React.FC<OrganizationSettingsModalProps> = ({ isOpen, onClose }) => {
    const { user, isAdmin, activeOrganization, updateOrganizationInState } = useAuth();

    const canonicalOrgId = activeOrganization
        ? resolveCanonicalPlasticinOrgId(activeOrganization.id)
        : 'personal';
    const isPersonal = !activeOrganization || canonicalOrgId === 'personal';
    const isPlatformRoot = canonicalOrgId === PlatformPlasticinOrgId;

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isDirAdmin, setIsDirAdmin] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const hasLocalAdminRole = Boolean(
        isAdmin ||
            activeOrganization?.role === 'owner' ||
            activeOrganization?.role === 'admin' ||
            isDirAdmin
    );
    const canSave = !isPersonal && !isPlatformRoot && hasLocalAdminRole;

    useEffect(() => {
        if (!isOpen) {
            setErrorMessage(null);
            setSuccessMessage(null);
            return;
        }

        const initialName = isPersonal
            ? 'Personal'
            : sanitizeOrgName(activeOrganization?.name, 'Organization');
        const initialDesc = sanitizeOrgDescription(activeOrganization?.description || '');
        setName(initialName);
        setDescription(initialDesc);
        setIsDirAdmin(false);

        if (isPersonal || isPlatformRoot) return;

        const ctrl = new AbortController();
        fetchPlasticinDirectoryDetail(canonicalOrgId, ctrl.signal).then((detail) => {
            if (ctrl.signal.aborted) return;
            if (detail.organization?.name && detail.organization.name !== 'Plasticin') {
                setName(sanitizeOrgName(detail.organization.name, initialName));
            }
            if (typeof detail.organization?.description === 'string') {
                setDescription(sanitizeOrgDescription(detail.organization.description));
            }
            const normalizedEmail = (user?.email || '').toLowerCase();
            if (Array.isArray(detail.members) && (user?.id || normalizedEmail)) {
                const adminMatch = detail.members.some(
                    (m) =>
                        ((user?.id && m.id === user.id) ||
                            (normalizedEmail && m.email && m.email.toLowerCase() === normalizedEmail)) &&
                        (m.role === 'owner' || m.role === 'admin')
                );
                if (adminMatch) {
                    setIsDirAdmin(true);
                }
            }
        });

        return () => {
            ctrl.abort();
        };
    }, [isOpen, canonicalOrgId, isPersonal, isPlatformRoot, activeOrganization?.name, activeOrganization?.description, user?.id, user?.email]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) {
            setErrorMessage('Permission denied: Only an organization owner or administrator can update Organization Settings.');
            return;
        }

        const cleanName = sanitizeOrgName(name, '');
        const cleanDesc = sanitizeOrgDescription(description);

        if (cleanName.length < 2 || cleanName.length > 60) {
            setErrorMessage('Organization name must be between 2 and 60 characters.');
            return;
        }
        if (cleanName.toLowerCase() === 'plasticin') {
            setErrorMessage('The name "Plasticin" is reserved for the root platform organization.');
            return;
        }

        setIsSaving(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        const result = await publishOrganizationUpdateToEcosystem({
            orgId: canonicalOrgId,
            name: cleanName,
            description: cleanDesc,
            slug: activeOrganization?.slug,
        });

        setIsSaving(false);

        if (!result.ok) {
            setErrorMessage(result.error || 'Failed to save organization settings.');
            return;
        }

        const savedName = sanitizeOrgName(result.organization?.name || cleanName, cleanName);
        const savedDesc = sanitizeOrgDescription(result.organization?.description ?? cleanDesc);
        updateOrganizationInState(canonicalOrgId, savedName, savedDesc);
        setSuccessMessage('Organization settings saved and synchronized across ecosystem.');
        setTimeout(() => {
            onClose();
        }, 650);
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1300,
                backgroundColor: 'rgba(18, 17, 15, 0.72)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="memcut-org-settings-title"
                style={{
                    width: '100%',
                    maxWidth: '500px',
                    backgroundColor: '#171614',
                    border: '1px solid #33312C',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    color: '#F5F5F4',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
            >
                <div
                    style={{
                        padding: '16px 20px',
                        borderBottom: '1px solid #33312C',
                        backgroundColor: '#12110F',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                backgroundColor: '#21201D',
                                border: '1px solid #33312C',
                                color: '#C8F931',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <Building2 size={16} />
                        </div>
                        <div>
                            <h2 id="memcut-org-settings-title" style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#F5F5F4' }}>
                                Organization Settings
                            </h2>
                            <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#A8A29E' }}>
                                Synchronized across Plasticin, Ideanite, ArchiMantis, NanCat, and Memcut.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            padding: '6px',
                            borderRadius: '8px',
                            backgroundColor: 'transparent',
                            border: '1px solid transparent',
                            color: '#A8A29E',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {isPersonal && (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24', fontSize: '12px' }}>
                            Select an organization from the profile menu switcher to configure Organization Settings.
                        </div>
                    )}

                    {isPlatformRoot && (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24', fontSize: '12px' }}>
                            The root platform organization &quot;Plasticin&quot; is protected and cannot be renamed.
                        </div>
                    )}

                    {!isPersonal && !isPlatformRoot && !hasLocalAdminRole && (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.1)', color: '#fca5a5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldAlert size={15} style={{ flexShrink: 0 }} />
                            <span>Permission denied: Only an organization owner or administrator can update Organization Settings.</span>
                        </div>
                    )}

                    {errorMessage && (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.1)', color: '#fca5a5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={15} style={{ flexShrink: 0 }} />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {successMessage && (
                        <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(52,211,153,0.35)', backgroundColor: 'rgba(52,211,153,0.1)', color: '#6ee7b7', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label htmlFor="memcut-org-settings-name" style={{ fontSize: '12px', fontWeight: 600, color: '#F5F5F4' }}>
                            Organization Name
                        </label>
                        <input
                            id="memcut-org-settings-name"
                            type="text"
                            minLength={2}
                            maxLength={60}
                            required
                            disabled={!canSave || isSaving}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Organization name (2–60 characters)"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                backgroundColor: '#12110F',
                                border: '1px solid #33312C',
                                color: '#F5F5F4',
                                fontSize: '13px',
                                outline: 'none',
                                opacity: canSave ? 1 : 0.55,
                            }}
                        />
                        <span style={{ fontSize: '11px', color: '#78716C' }}>
                            2–60 characters. Updates immediately across all synchronized apps.
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label htmlFor="memcut-org-settings-description" style={{ fontSize: '12px', fontWeight: 600, color: '#F5F5F4' }}>
                                Organization Description
                            </label>
                            <span
                                style={{
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    color: description.length >= 200 ? '#f59e0b' : '#A8A29E',
                                    fontWeight: description.length >= 200 ? 600 : 400,
                                }}
                            >
                                {description.length}/200
                            </span>
                        </div>
                        <textarea
                            id="memcut-org-settings-description"
                            rows={3}
                            maxLength={200}
                            disabled={!canSave || isSaving}
                            value={description}
                            onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                            placeholder="Describe your organization's purpose, focus, or governance scope (up to 200 characters)..."
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '9px 12px',
                                borderRadius: '8px',
                                backgroundColor: '#12110F',
                                border: '1px solid #33312C',
                                color: '#F5F5F4',
                                fontSize: '13px',
                                outline: 'none',
                                resize: 'vertical',
                                fontFamily: 'inherit',
                                opacity: canSave ? 1 : 0.55,
                            }}
                        />
                    </div>

                    <div style={{ paddingTop: '12px', borderTop: '1px solid #33312C', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            style={{
                                padding: '7px 14px',
                                borderRadius: '8px',
                                backgroundColor: '#21201D',
                                border: '1px solid #33312C',
                                color: '#D6D3D1',
                                fontSize: '12px',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!canSave || isSaving}
                            style={{
                                padding: '7px 16px',
                                borderRadius: '8px',
                                backgroundColor: '#C8F931',
                                border: 'none',
                                color: '#12110F',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: !canSave || isSaving ? 'not-allowed' : 'pointer',
                                opacity: !canSave || isSaving ? 0.5 : 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 size={14} className="vizja-spin" />
                                    <span>Saving Changes...</span>
                                </>
                            ) : (
                                <span>Save Changes</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default OrganizationSettingsModal;
