import React, { useState, useEffect } from 'react';
import { Building2, Users, X, AlertCircle, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
    PlatformPlasticinOrgId,
    fetchPlasticinDirectoryDetail,
    fetchPlasticinOrgGroups,
    publishOrganizationUpdateToEcosystem,
    resolveCanonicalPlasticinOrgId,
    sanitizeOrgDescription,
    sanitizeOrgName,
    syncWorkspaceMemberRoleToPlasticin,
    type EcosystemWorkspaceItem,
    type PlasticinDirectoryMember,
    type PlasticinOrgRoleGroup,
} from '../lib/ecosystemOrgSync';

interface OrganizationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeWorkspace?: EcosystemWorkspaceItem | null;
    workspaces?: EcosystemWorkspaceItem[];
}

export const OrganizationSettingsModal: React.FC<OrganizationSettingsModalProps> = ({
    isOpen,
    onClose,
    activeWorkspace,
    workspaces = [],
}) => {
    const { user, isAdmin, activeOrganization, updateOrganizationInState } = useAuth();

    const canonicalOrgId = activeOrganization
        ? resolveCanonicalPlasticinOrgId(activeOrganization.id)
        : 'personal';
    const isPersonal = !activeOrganization || canonicalOrgId === 'personal';
    const isPlatformRoot = canonicalOrgId === PlatformPlasticinOrgId;

    const [activeTab, setActiveTab] = useState<'general' | 'members'>('general');
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isDirAdmin, setIsDirAdmin] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [members, setMembers] = useState<PlasticinDirectoryMember[]>([]);
    const [orgRoleGroups, setOrgRoleGroups] = useState<PlasticinOrgRoleGroup[]>([]);
    const [groupMemberships, setGroupMemberships] = useState<Record<string, string[]>>({});
    const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
    const [memberRoleOverrides, setMemberRoleOverrides] = useState<Record<string, string>>({});
    const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
    const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);

    const selectedWorkspace =
        workspaces.find((w) => w.id === selectedWorkspaceId) || activeWorkspace || workspaces[0] || null;
    const isWorkspaceLead = String(selectedWorkspace?.teamRole || '').toLowerCase() === 'lead';

    const hasLocalAdminRole = Boolean(
        isAdmin ||
            activeOrganization?.role === 'owner' ||
            activeOrganization?.role === 'admin' ||
            isDirAdmin
    );
    const canSave = !isPersonal && !isPlatformRoot && hasLocalAdminRole;
    const canManageMembers = !isPersonal && (hasLocalAdminRole || isWorkspaceLead);

    useEffect(() => {
        if (!isOpen) {
            setErrorMessage(null);
            setSuccessMessage(null);
            setActiveTab('general');
            return;
        }

        const initialName = isPersonal
            ? 'Personal'
            : sanitizeOrgName(activeOrganization?.name, 'Organization');
        const initialDesc = sanitizeOrgDescription(activeOrganization?.description || '');
        setName(initialName);
        setDescription(initialDesc);
        setIsDirAdmin(false);
        setMemberRoleOverrides({});
        setSelectedWorkspaceId(activeWorkspace?.id || workspaces[0]?.id || '');

        if (isPersonal) {
            setMembers([]);
            setOrgRoleGroups([]);
            setGroupMemberships({});
            return;
        }

        const ctrl = new AbortController();
        setIsLoadingDirectory(true);
        Promise.all([
            fetchPlasticinDirectoryDetail(canonicalOrgId, ctrl.signal),
            fetchPlasticinOrgGroups(canonicalOrgId, ctrl.signal),
        ])
            .then(([detail, grpData]) => {
                if (ctrl.signal.aborted) return;
                if (!isPlatformRoot && detail.organization?.name && detail.organization.name !== 'Plasticin') {
                    setName(sanitizeOrgName(detail.organization.name, initialName));
                }
                if (!isPlatformRoot && typeof detail.organization?.description === 'string') {
                    setDescription(sanitizeOrgDescription(detail.organization.description));
                }
                if (Array.isArray(detail.members)) {
                    setMembers(detail.members);
                    const normalizedEmail = (user?.email || '').toLowerCase();
                    if (user?.id || normalizedEmail) {
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
                }
                if (!activeWorkspace?.id && detail.teams.length > 0) {
                    setSelectedWorkspaceId((prev) => prev || detail.teams[0].id);
                }
                setOrgRoleGroups(grpData.groups.filter((g) => !g.isSystem));
                setGroupMemberships(grpData.groupMemberships);
            })
            .finally(() => {
                if (!ctrl.signal.aborted) setIsLoadingDirectory(false);
            });

        return () => {
            ctrl.abort();
        };
    }, [
        isOpen,
        canonicalOrgId,
        isPersonal,
        isPlatformRoot,
        activeOrganization?.name,
        activeOrganization?.description,
        activeWorkspace?.id,
        workspaces,
        user?.id,
        user?.email,
    ]);

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

    const getMemberRoleValue = (member: PlasticinDirectoryMember): string => {
        if (memberRoleOverrides[member.id]) return memberRoleOverrides[member.id];
        for (const grp of orgRoleGroups) {
            const assigned = groupMemberships[grp.id];
            if (Array.isArray(assigned) && assigned.includes(member.id)) {
                return grp.id;
            }
        }
        const raw = String(member.role || 'member').toLowerCase();
        if (raw === 'owner' || raw === 'admin') return 'admin';
        if (raw === 'lead' || raw === 'manager' || raw === 'workspace manager' || raw === 'project manager') {
            return 'Workspace manager';
        }
        return 'Workspace member';
    };

    const handleMemberRoleSync = async (member: PlasticinDirectoryMember, nextRole: string) => {
        if (!canManageMembers) {
            setErrorMessage('Permission denied: Organization admin or workspace manager role required.');
            return;
        }
        const targetTeamId = selectedWorkspaceId || activeWorkspace?.id || workspaces[0]?.id || '';
        if (!targetTeamId) {
            setErrorMessage('Select a workspace first to synchronize member roles.');
            return;
        }
        setSavingMemberId(member.id);
        setErrorMessage(null);
        setSuccessMessage(null);

        const result = await syncWorkspaceMemberRoleToPlasticin({
            orgId: canonicalOrgId,
            teamId: targetTeamId,
            userId: member.id,
            role: nextRole,
        });

        setSavingMemberId(null);

        if (!result.ok) {
            setErrorMessage(result.error || 'Failed to synchronize member role with Plasticin Directory.');
            return;
        }

        setMemberRoleOverrides((prev) => ({ ...prev, [member.id]: nextRole }));
        if (result.matchedRoleGroupId) {
            const grpId = result.matchedRoleGroupId;
            setGroupMemberships((prev) => ({
                ...prev,
                [grpId]: Array.from(new Set([...(prev[grpId] || []), member.id])),
            }));
        }
        setSuccessMessage(`Synchronized role for ${member.displayName || member.username || member.email || 'member'} across ecosystem.`);
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

                {!isPersonal && (
                    <div
                        style={{
                            display: 'flex',
                            gap: '6px',
                            padding: '10px 20px 0 20px',
                            borderBottom: '1px solid #33312C',
                            backgroundColor: '#141311',
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('general');
                                setErrorMessage(null);
                                setSuccessMessage(null);
                            }}
                            style={{
                                padding: '8px 12px',
                                border: 'none',
                                borderBottom: activeTab === 'general' ? '2px solid #C8F931' : '2px solid transparent',
                                backgroundColor: 'transparent',
                                color: activeTab === 'general' ? '#F5F5F4' : '#A8A29E',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <Building2 size={13} />
                            <span>General</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setActiveTab('members');
                                setErrorMessage(null);
                                setSuccessMessage(null);
                            }}
                            style={{
                                padding: '8px 12px',
                                border: 'none',
                                borderBottom: activeTab === 'members' ? '2px solid #C8F931' : '2px solid transparent',
                                backgroundColor: 'transparent',
                                color: activeTab === 'members' ? '#F5F5F4' : '#A8A29E',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            <Users size={13} />
                            <span>Members &amp; Roles</span>
                        </button>
                    </div>
                )}

                {activeTab === 'members' && !isPersonal ? (
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '65vh', overflowY: 'auto' }}>
                        {!canManageMembers && (
                            <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.1)', color: '#fbbf24', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShieldAlert size={15} style={{ flexShrink: 0 }} />
                                <span>Read-only view: Only organization admins or workspace managers can update workspace roles.</span>
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

                        {workspaces.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="memcut-workspace-role-scope" style={{ fontSize: '11px', fontWeight: 600, color: '#A8A29E' }}>
                                    Workspace Scope
                                </label>
                                <select
                                    id="memcut-workspace-role-scope"
                                    value={selectedWorkspaceId}
                                    onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        backgroundColor: '#12110F',
                                        border: '1px solid #33312C',
                                        color: '#F5F5F4',
                                        fontSize: '12px',
                                    }}
                                >
                                    {workspaces.map((ws) => (
                                        <option key={ws.id} value={ws.id}>
                                            {ws.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {isLoadingDirectory ? (
                            <div style={{ padding: '24px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#A8A29E', fontSize: '12px' }}>
                                <Loader2 size={15} className="vizja-spin" />
                                <span>Loading synchronized members and role groups...</span>
                            </div>
                        ) : members.length === 0 ? (
                            <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid #33312C', backgroundColor: '#12110F', color: '#A8A29E', fontSize: '12px', textAlign: 'center' }}>
                                No directory members found for this organization.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {members.map((member) => {
                                    const isOwner = String(member.role || '').toLowerCase() === 'owner';
                                    const currentVal = getMemberRoleValue(member);
                                    const isRowSaving = savingMemberId === member.id;
                                    return (
                                        <div
                                            key={member.id}
                                            style={{
                                                padding: '10px 12px',
                                                borderRadius: '8px',
                                                backgroundColor: '#12110F',
                                                border: '1px solid #33312C',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '10px',
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                            <div style={{ minWidth: 0, flex: '1 1 160px' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 600, color: '#F5F5F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {member.displayName || member.username || member.email || 'Member'}
                                                </div>
                                                {member.email && (
                                                    <div style={{ fontSize: '11px', color: '#78716C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {member.email}
                                                    </div>
                                                )}
                                            </div>
                                            {isOwner ? (
                                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#C8F931', padding: '4px 8px', borderRadius: '6px', backgroundColor: 'rgba(200,249,49,0.12)', border: '1px solid rgba(200,249,49,0.3)' }}>
                                                    Owner
                                                </span>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {isRowSaving && <Loader2 size={13} className="vizja-spin" />}
                                                    <select
                                                        value={currentVal}
                                                        disabled={!canManageMembers || isRowSaving || !selectedWorkspaceId}
                                                        onChange={(e) => handleMemberRoleSync(member, e.target.value)}
                                                        style={{
                                                            padding: '6px 8px',
                                                            borderRadius: '6px',
                                                            backgroundColor: '#21201D',
                                                            border: '1px solid #33312C',
                                                            color: '#F5F5F4',
                                                            fontSize: '11px',
                                                            opacity: canManageMembers && !isRowSaving ? 1 : 0.6,
                                                        }}
                                                    >
                                                        <optgroup label="Standard Roles">
                                                            <option value="Workspace manager">Workspace manager</option>
                                                            <option value="Workspace member">Workspace member</option>
                                                            <option value="admin">Admin</option>
                                                        </optgroup>
                                                        {orgRoleGroups.length > 0 && (
                                                            <optgroup label="Organization Role Groups">
                                                                {orgRoleGroups.map((grp) => (
                                                                    <option key={grp.id} value={grp.id}>
                                                                        {grp.name}
                                                                    </option>
                                                                ))}
                                                            </optgroup>
                                                        )}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div style={{ paddingTop: '10px', borderTop: '1px solid #33312C', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={onClose}
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
                                Close
                            </button>
                        </div>
                    </div>
                ) : (
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
                )}
            </div>
        </div>
    );
};

export default OrganizationSettingsModal;
