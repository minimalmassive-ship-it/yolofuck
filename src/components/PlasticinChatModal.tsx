import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
    MessageSquare,
    Inbox,
    Send,
    X,
    ExternalLink,
    ChevronLeft,
    ChevronDown,
    Hash,
    Lock,
    Users,
    Radio,
    Building2,
    Check,
    Settings,
    Pin,
    Megaphone,
    FileText,
    Loader2,
} from 'lucide-react';
import { useAuth, type OrganizationItem } from '../contexts/AuthContext';
import {
    PlatformPlasticinOrgId,
    PlasticinChatHubUrl,
    PrimaryPlasticinOrgId,
    fetchPlasticinOrganizations,
    getPlasticinAuthHeaders,
    getPlasticinRealtimeClient,
    isAbortError,
    isPrimaryCustomerOrgId,
    isSameOrgEntity,
    resolveCanonicalPlasticinOrgId,
    resolveCanonicalRoomId,
    sanitizeDisplayText,
    sanitizeOrgDescription,
    sanitizeOrgName,
    sanitizeSafeUrl,
    subscribeToEcosystemOrgSync,
} from '../lib/ecosystemOrgSync';
import './PlasticinChatModal.css';

export interface ChatAttachment {
    id: string;
    name: string;
    sizeBytes: number;
    mimeType: string;
    url: string;
    uploaderHandle: string;
    createdAt: string;
}

export interface ChatRoom {
    id: string;
    organizationId: string;
    workspaceId?: string;
    roomType: 'management' | 'workspace';
    name: string;
    topic?: string;
    isPrivate: boolean;
}

export interface EcosystemChatMessage {
    id: string;
    roomId: string;
    senderId?: string;
    senderHandle: string;
    senderDisplayName: string;
    senderAvatarUrl?: string;
    content: string;
    isPinned?: boolean;
    reactions?: Record<string, string[]>;
    createdAt: string;
}

export interface OnlinePresenceUser {
    handle: string;
    displayName: string;
    avatarUrl?: string;
}

export interface PlasticinChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenOrgSettings?: () => void;
}

export const PlasticinChatModal: React.FC<PlasticinChatModalProps> = ({
    isOpen,
    onClose,
    onOpenOrgSettings,
}) => {
    const {
        user,
        profile,
        isAdmin,
        organizations: authOrgs,
        activeOrganization,
        setActiveOrganization,
    } = useAuth();

    const [activeSlide, setActiveSlide] = useState<'directory' | 'conversation'>('conversation');
    const [activeView, setActiveView] = useState<'chat' | 'inbox'>('chat');
    const [remoteOrgs, setRemoteOrgs] = useState<OrganizationItem[]>([]);
    const [selectedOrgId, setSelectedOrgId] = useState<string>(() =>
        resolveCanonicalPlasticinOrgId(activeOrganization?.id || PrimaryPlasticinOrgId)
    );
    const [isOrgMenuOpen, setIsOrgMenuOpen] = useState(false);

    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [activeRoomId, setActiveRoomId] = useState<string>('');
    const [messages, setMessages] = useState<EcosystemChatMessage[]>([]);
    const [inboxFiles, setInboxFiles] = useState<ChatAttachment[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [inputText, setInputText] = useState('');
    const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<OnlinePresenceUser[]>([]);

    const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
    const [announceTitle, setAnnounceTitle] = useState('');
    const [announceContent, setAnnounceContent] = useState('');
    const [announceError, setAnnounceError] = useState<string | null>(null);
    const [sendingAnnounce, setSendingAnnounce] = useState(false);

    const channelRef = useRef<RealtimeChannel | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const currentHandle = useMemo(() => {
        if (profile?.username) {
            return profile.username.startsWith('@') ? profile.username : `@${profile.username}`;
        }
        if (user?.email) {
            return `@${user.email.split('@')[0]}`;
        }
        return '@memcut-user';
    }, [profile?.username, user?.email]);

    const currentDisplayName = useMemo(() => {
        return sanitizeDisplayText(
            profile?.display_name || profile?.username || user?.user_metadata?.username || currentHandle.replace(/^@/, ''),
            60
        ) || 'Member';
    }, [profile?.display_name, profile?.username, user?.user_metadata?.username, currentHandle]);

    const currentAvatarUrl = useMemo(() => {
        return sanitizeSafeUrl(profile?.avatar_url || user?.user_metadata?.avatar_url, true) || undefined;
    }, [profile?.avatar_url, user?.user_metadata?.avatar_url]);

    useEffect(() => {
        if (activeOrganization?.id) {
            const cId = resolveCanonicalPlasticinOrgId(activeOrganization.id);
            if (cId !== 'personal') setSelectedOrgId(cId);
        }
    }, [activeOrganization?.id]);

    // Fetch all organizations & subscribe to ecosystem-org-sync
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        const ctrl = new AbortController();

        fetchPlasticinOrganizations(ctrl.signal).then((list) => {
            if (!isMounted || list.length === 0) return;
            setRemoteOrgs(list);
        });

        const unsub = subscribeToEcosystemOrgSync({
            onOrganizationUpdated: ({ id, name, description }) => {
                if (!isMounted) return;
                const cId = resolveCanonicalPlasticinOrgId(id);
                const cleanName = sanitizeOrgName(name, '');
                if (!cleanName) return;
                setRemoteOrgs((prev) =>
                    prev.map((o) =>
                        isSameOrgEntity(o.id, cId)
                            ? {
                                ...o,
                                name: cleanName,
                                ...(description !== undefined ? { description: sanitizeOrgDescription(description) } : {}),
                            }
                            : o
                    )
                );
                setRooms((prev) =>
                    prev.map((r) =>
                        isSameOrgEntity(r.organizationId, cId) && r.roomType === 'management'
                            ? {
                                ...r,
                                name: cleanName,
                                ...(description !== undefined
                                    ? { topic: description || `${cleanName} organizational governance and management directives.` }
                                    : {}),
                            }
                            : r
                    )
                );
            },
        });

        return () => {
            isMounted = false;
            ctrl.abort();
            unsub();
        };
    }, [isOpen]);

    const allOrganizations = useMemo(() => {
        const map = new Map<string, OrganizationItem>();
        for (const org of authOrgs) {
            if (!org?.id) continue;
            const cId = resolveCanonicalPlasticinOrgId(org.id);
            if (cId === 'personal') continue;
            map.set(cId, { ...org, id: cId });
        }
        for (const org of remoteOrgs) {
            if (!org?.id) continue;
            const cId = resolveCanonicalPlasticinOrgId(org.id);
            if (cId === 'personal') continue;
            const prev = map.get(cId);
            map.set(cId, { ...(prev || {}), ...org, id: cId, role: prev?.role || org.role });
        }
        if (map.size === 0) {
            map.set(PrimaryPlasticinOrgId, {
                id: PrimaryPlasticinOrgId,
                name: 'Organization',
                slug: 'singularity',
            });
        }
        return Array.from(map.values());
    }, [authOrgs, remoteOrgs]);

    const currentOrg = useMemo(() => {
        return (
            allOrganizations.find((o) => isSameOrgEntity(o.id, selectedOrgId)) ||
            allOrganizations[0] || {
                id: PrimaryPlasticinOrgId,
                name: 'Organization',
                slug: 'singularity',
            }
        );
    }, [allOrganizations, selectedOrgId]);

    const canonicalOrgId = resolveCanonicalPlasticinOrgId(currentOrg.id);
    const currentOrgName = sanitizeOrgName(
        currentOrg.name,
        canonicalOrgId === PlatformPlasticinOrgId ? 'Plasticin' : 'Organization'
    );
    const isManager = Boolean(isAdmin || currentOrg.role === 'owner' || currentOrg.role === 'admin');

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                if (isAnnounceModalOpen) {
                    setIsAnnounceModalOpen(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isAnnounceModalOpen, onClose]);

    // Fetch rooms for selected organization from Plasticin Chat Hub
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        const ctrl = new AbortController();

        const loadRooms = async () => {
            try {
                const authHeaders = await getPlasticinAuthHeaders(false);
                if (!authHeaders['Authorization']) return;
                const res = await fetch(
                    `${PlasticinChatHubUrl}?action=rooms&orgId=${encodeURIComponent(canonicalOrgId)}&orgName=${encodeURIComponent(currentOrgName)}`,
                    { headers: authHeaders, credentials: 'include', cache: 'no-store', signal: ctrl.signal }
                );
                if (!res.ok) return;
                const data = await res.json();
                if (!isMounted || !Array.isArray(data?.rooms)) return;

                const isPrimaryOrg = isPrimaryCustomerOrgId(canonicalOrgId);
                const normalized: ChatRoom[] = data.rooms
                    .filter((r: ChatRoom) => {
                        const s = String(r.id || '').toLowerCase();
                        const n = String(r.name || '').toLowerCase();
                        if (s.includes('test') || n.includes('test')) return false;
                        if (isPrimaryOrg) {
                            if (s.includes('archimantis') && !s.includes('nc-835')) return false;
                            if (s.includes('ideanite')) return false;
                        }
                        return true;
                    })
                    .map((r: ChatRoom) => {
                        const canonicalRoom = resolveCanonicalRoomId(r.id, canonicalOrgId);
                        const isMgmt = r.roomType === 'management' || canonicalRoom.endsWith('_mgmt');
                        return {
                            ...r,
                            id: canonicalRoom,
                            organizationId: canonicalOrgId,
                            roomType: isMgmt ? 'management' : 'workspace',
                            name: isMgmt ? currentOrgName : sanitizeOrgName(r.name, 'Workspace'),
                            topic: sanitizeDisplayText(r.topic || '', 240),
                        };
                    });

                setRooms(normalized);
                setActiveRoomId((prev) => {
                    if (prev && normalized.some((r) => r.id === prev)) return prev;
                    const preferred =
                        normalized.find((r) => r.roomType === 'management') ||
                        normalized[0];
                    return preferred ? preferred.id : resolveCanonicalRoomId('mgmt', canonicalOrgId);
                });
            } catch (err) {
                if (!isAbortError(err)) {
                    console.warn('[MemcutChat] Fetch rooms error:', err);
                }
            }
        };

        loadRooms();
        return () => {
            isMounted = false;
            ctrl.abort();
        };
    }, [isOpen, canonicalOrgId, currentOrgName]);

    // Fetch messages or inbox from Plasticin Chat Hub
    useEffect(() => {
        if (!isOpen || !activeRoomId) return;
        let isMounted = true;
        let activeCtrl: AbortController | null = null;
        setLoadingMessages(true);

        const loadRoomData = async () => {
            try {
                activeCtrl?.abort();
                activeCtrl = new AbortController();
                const authHeaders = await getPlasticinAuthHeaders(false);
                if (!authHeaders['Authorization']) return;
                const action = activeView === 'chat' ? 'messages' : 'inbox';
                const res = await fetch(
                    `${PlasticinChatHubUrl}?action=${action}&orgId=${encodeURIComponent(canonicalOrgId)}&roomId=${encodeURIComponent(activeRoomId)}`,
                    { headers: authHeaders, credentials: 'include', cache: 'no-store', signal: activeCtrl.signal }
                );
                if (!res.ok || !isMounted) return;
                const data = await res.json();
                if (!isMounted) return;
                if (activeView === 'chat') {
                    setMessages(Array.isArray(data?.messages) ? data.messages : []);
                } else {
                    setInboxFiles(Array.isArray(data?.files) ? data.files : []);
                }
            } catch (err) {
                if (!isAbortError(err)) {
                    console.warn('[MemcutChat] Load room data error:', err);
                }
            } finally {
                if (isMounted) setLoadingMessages(false);
            }
        };

        loadRoomData();
        const interval = setInterval(() => { if (!document.hidden) loadRoomData(); }, 45000);

        return () => {
            isMounted = false;
            activeCtrl?.abort();
            clearInterval(interval);
        };
    }, [isOpen, activeRoomId, activeView]);

    // Subscribe to unified Plasticin Realtime Channel (plst_chat_${safeOrg}_${safeRoom})
    useEffect(() => {
        if (!isOpen || !activeRoomId || !canonicalOrgId) return;
        const client = getPlasticinRealtimeClient();
        const safeOrg = canonicalOrgId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeRoom = activeRoomId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const topic = `plst_chat_${safeOrg}_${safeRoom}`;

        const channel = client.channel(topic, {
            config: {
                broadcast: { ack: false, self: false },
                presence: { key: currentHandle },
            },
        });

        channel
            .on('broadcast', { event: 'new_message' }, ({ payload }) => {
                if (payload?.message && payload.message.roomId === activeRoomId) {
                    setMessages((prev) => {
                        if (prev.some((m) => m.id === payload.message.id)) return prev;
                        return [...prev, payload.message];
                    });
                }
            })
            .on('broadcast', { event: 'reaction_updated' }, ({ payload }) => {
                if (payload?.messageId && payload?.reactions) {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m
                        )
                    );
                }
            })
            .on('broadcast', { event: 'pin_updated' }, ({ payload }) => {
                if (payload?.messageId && typeof payload.isPinned === 'boolean') {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === payload.messageId ? { ...m, isPinned: payload.isPinned } : m
                        )
                    );
                }
            })
            .on('broadcast', { event: 'announcement_fanned' }, ({ payload }) => {
                if (Array.isArray(payload?.messages)) {
                    const match = payload.messages.find((m: EcosystemChatMessage) => m.roomId === activeRoomId);
                    if (match) {
                        setMessages((prev) => {
                            if (prev.some((m) => m.id === match.id)) return prev;
                            return [...prev, match];
                        });
                    }
                }
            })
            .on('presence', { event: 'sync' }, () => {
                const rawState = channel.presenceState();
                const seen = new Set<string>();
                const online: OnlinePresenceUser[] = [];
                for (const presences of Object.values(rawState)) {
                    if (Array.isArray(presences)) {
                        for (const p of presences as Array<Record<string, unknown>>) {
                            const handle = typeof p?.handle === 'string' ? p.handle : '';
                            if (handle && !seen.has(handle)) {
                                seen.add(handle);
                                online.push({
                                    handle: sanitizeDisplayText(handle, 64),
                                    displayName: sanitizeDisplayText(p.displayName || handle, 64),
                                    avatarUrl: sanitizeSafeUrl(p.avatarUrl, true) || undefined,
                                });
                            }
                        }
                    }
                }
                setOnlineUsers(online);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    setIsRealtimeConnected(true);
                    try {
                        await channel.track({
                            handle: currentHandle,
                            displayName: currentDisplayName,
                            avatarUrl: currentAvatarUrl,
                            onlineAt: new Date().toISOString(),
                        });
                    } catch {}
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    setIsRealtimeConnected(false);
                }
            });

        channelRef.current = channel;

        return () => {
            setIsRealtimeConnected(false);
            channel.untrack().catch(() => {});
            client.removeChannel(channel).catch(() => {});
            channelRef.current = null;
        };
    }, [isOpen, canonicalOrgId, activeRoomId, currentHandle, currentDisplayName, currentAvatarUrl]);

    useEffect(() => {
        if (activeView === 'chat' && activeSlide === 'conversation') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, activeView, activeSlide]);

    const handleSelectOrg = (org: OrganizationItem) => {
        const cId = resolveCanonicalPlasticinOrgId(org.id);
        setSelectedOrgId(cId);
        setActiveOrganization(org);
        setActiveRoomId('');
        setMessages([]);
        setIsOrgMenuOpen(false);
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const text = inputText.trim();
        if (!text || sendingMessage || !activeRoomId) return;

        setSendingMessage(true);
        setSendError(null);

        try {
            const headers = await getPlasticinAuthHeaders(true);
            const res = await fetch(PlasticinChatHubUrl, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    action: 'send_message',
                    orgId: canonicalOrgId,
                    roomId: activeRoomId,
                    content: text,
                    senderHandle: currentHandle,
                    senderDisplayName: currentDisplayName,
                    senderAvatarUrl: currentAvatarUrl,
                }),
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.message) {
                setSendError(sanitizeDisplayText(data?.error || `HTTP ${res.status}`, 200));
                return;
            }

            setInputText('');
            setMessages((prev) => {
                if (prev.some((m) => m.id === data.message.id)) return prev;
                return [...prev, data.message];
            });
            channelRef.current
                ?.send({
                    type: 'broadcast',
                    event: 'new_message',
                    payload: { message: data.message },
                })
                .catch(() => {});
        } catch (err) {
            setSendError(err instanceof Error ? err.message : 'Failed to send message.');
        } finally {
            setSendingMessage(false);
        }
    };

    const handleTogglePin = async (messageId: string) => {
        try {
            const headers = await getPlasticinAuthHeaders(true);
            const res = await fetch(PlasticinChatHubUrl, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    action: 'pin',
                    orgId: canonicalOrgId,
                    roomId: activeRoomId,
                    messageId,
                }),
            });
            if (!res.ok) return;
            const data = await res.json();
            setMessages((prev) =>
                prev.map((m) => (m.id === messageId ? { ...m, isPinned: data.isPinned } : m))
            );
            channelRef.current
                ?.send({
                    type: 'broadcast',
                    event: 'pin_updated',
                    payload: { messageId, isPinned: data.isPinned },
                })
                .catch(() => {});
        } catch {}
    };

    const handleToggleReaction = async (messageId: string, emoji: string) => {
        try {
            const headers = await getPlasticinAuthHeaders(true);
            const res = await fetch(PlasticinChatHubUrl, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    action: 'reaction',
                    orgId: canonicalOrgId,
                    roomId: activeRoomId,
                    messageId,
                    emoji,
                    userHandle: currentHandle,
                }),
            });
            if (!res.ok) return;
            const data = await res.json();
            setMessages((prev) =>
                prev.map((m) => (m.id === messageId ? { ...m, reactions: data.reactions } : m))
            );
            channelRef.current
                ?.send({
                    type: 'broadcast',
                    event: 'reaction_updated',
                    payload: { messageId, reactions: data.reactions },
                })
                .catch(() => {});
        } catch {}
    };

    const handleSendAnnouncement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!announceContent.trim() || sendingAnnounce) return;
        setSendingAnnounce(true);
        setAnnounceError(null);

        try {
            const targets = rooms.filter((r) => r.roomType === 'workspace').map((r) => r.id);
            const headers = await getPlasticinAuthHeaders(true);
            const res = await fetch(PlasticinChatHubUrl, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    action: 'announcement',
                    orgId: canonicalOrgId,
                    roomId: activeRoomId,
                    title: sanitizeDisplayText(announceTitle, 80) || 'Organization Directive',
                    content: announceContent.trim(),
                    targetRoomIds: targets.length > 0 ? targets : [activeRoomId],
                    senderHandle: currentHandle,
                    senderDisplayName: currentDisplayName,
                    senderAvatarUrl: currentAvatarUrl,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAnnounceError(sanitizeDisplayText(data?.error || `HTTP ${res.status}`, 200));
                return;
            }
            if (Array.isArray(data?.messages)) {
                const match = data.messages.find((m: EcosystemChatMessage) => m.roomId === activeRoomId);
                if (match) {
                    setMessages((prev) => (prev.some((m) => m.id === match.id) ? prev : [...prev, match]));
                }
                channelRef.current
                    ?.send({
                        type: 'broadcast',
                        event: 'announcement_fanned',
                        payload: { messages: data.messages },
                    })
                    .catch(() => {});
            }
            setIsAnnounceModalOpen(false);
            setAnnounceTitle('');
            setAnnounceContent('');
            setAnnounceError(null);
        } catch (err) {
            setAnnounceError(err instanceof Error ? err.message : 'Failed to broadcast announcement.');
        } finally {
            setSendingAnnounce(false);
        }
    };

    if (!isOpen) return null;

    const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];
    const activeRoomTitle = activeRoom?.roomType === 'management' ? currentOrgName : activeRoom?.name || 'Chat';
    const pinnedMessages = messages.filter((m) => m.isPinned);

    return (
        <div className="plasticin-chat-backdrop">
            <div className="plasticin-chat-window">
                <header className="plasticin-chat-header">
                    <div className="plasticin-chat-brand-group">
                        <div className="plasticin-chat-brand-pill">
                            <span className="plasticin-chat-brand-badge">P</span>
                            <span className="plasticin-chat-brand-name">Plasticin Chat</span>
                        </div>
                        <span className="plasticin-chat-memcut-tag">Memcut</span>
                    </div>

                    <div className="plasticin-chat-swipe-nav" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeSlide === 'directory'}
                            className={`plasticin-chat-swipe-pill ${activeSlide === 'directory' ? 'active' : ''}`}
                            onClick={() => setActiveSlide('directory')}
                        >
                            <Users size={13} />
                            <span>Channels</span>
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeSlide === 'conversation'}
                            className={`plasticin-chat-swipe-pill ${activeSlide === 'conversation' ? 'active' : ''}`}
                            onClick={() => setActiveSlide('conversation')}
                        >
                            <MessageSquare size={13} />
                            <span>{activeRoomTitle}</span>
                        </button>
                    </div>

                    <div className="plasticin-chat-header-actions">
                        <a
                            href="https://chat.plasticin.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="plasticin-chat-external-btn"
                            title="Open standalone chat.plasticin.com"
                        >
                            <ExternalLink size={13} />
                            <span>chat.plasticin.com</span>
                        </a>
                        <button
                            type="button"
                            onClick={onClose}
                            className="plasticin-chat-close-btn"
                            title="Close Chat"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </header>

                <div className={`plasticin-chat-body ${activeSlide === 'directory' ? 'mobile-directory' : 'mobile-conversation'}`}>
                    {/* Sidebar: Organization Switcher, Rooms, Presence */}
                    <aside className="plasticin-chat-sidebar">
                        <div className="plasticin-chat-org-wrap">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#78716C' }}>
                                    Organization
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {onOpenOrgSettings && (
                                        <button
                                            type="button"
                                            onClick={onOpenOrgSettings}
                                            title="Organization Settings"
                                            style={{ background: 'transparent', border: 'none', color: '#A8A29E', cursor: 'pointer', padding: '4px' }}
                                        >
                                            <Settings size={13} />
                                        </button>
                                    )}
                                    {isManager && (
                                        <button
                                            type="button"
                                            onClick={() => setIsAnnounceModalOpen(true)}
                                            title="Management Announcement"
                                            style={{ background: 'transparent', border: 'none', color: '#A8A29E', cursor: 'pointer', padding: '4px' }}
                                        >
                                            <Megaphone size={13} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <button
                                type="button"
                                className="plasticin-chat-org-btn"
                                onClick={() => setIsOrgMenuOpen((prev) => !prev)}
                            >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <Building2 size={14} color="#C8F931" style={{ flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {currentOrgName}
                                    </span>
                                </span>
                                <ChevronDown size={14} color="#A8A29E" />
                            </button>

                            {isOrgMenuOpen && (
                                <div className="plasticin-chat-org-menu">
                                    {allOrganizations.map((org) => {
                                        const active = isSameOrgEntity(org.id, canonicalOrgId);
                                        return (
                                            <button
                                                key={org.id}
                                                type="button"
                                                className={`plasticin-chat-org-option ${active ? 'active' : ''}`}
                                                onClick={() => handleSelectOrg(org)}
                                            >
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {org.name}
                                                </span>
                                                {active && <Check size={13} style={{ flexShrink: 0 }} />}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="plasticin-chat-sidebar-scroll">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div className="plasticin-chat-section-title">
                                    <span>Channels</span>
                                    <span>{rooms.length}</span>
                                </div>
                                {rooms.map((room) => {
                                    const active = room.id === activeRoom?.id;
                                    return (
                                        <button
                                            key={room.id}
                                            type="button"
                                            className={`plasticin-chat-room-item ${active ? 'active' : ''}`}
                                            onClick={() => {
                                                setActiveRoomId(room.id);
                                                setActiveView('chat');
                                                setActiveSlide('conversation');
                                            }}
                                        >
                                            {room.isPrivate || room.roomType === 'management' ? (
                                                <Lock size={13} style={{ flexShrink: 0 }} />
                                            ) : (
                                                <Hash size={13} style={{ flexShrink: 0 }} />
                                            )}
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {room.name}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div className="plasticin-chat-section-title">
                                    <span>Active Team</span>
                                    <span>{onlineUsers.length + 1}</span>
                                </div>
                                <div style={{ padding: '7px 9px', borderRadius: '8px', background: '#12110F', border: '1px solid #21201D', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: '#F5F5F4' }}>Antigravity Agent</div>
                                        <div style={{ fontSize: '10px', color: '#78716C' }}>@antigravity-agent</div>
                                    </div>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#C8F931' }} />
                                </div>
                                {onlineUsers.map((u) => (
                                    <div key={u.handle} style={{ padding: '7px 9px', borderRadius: '8px', background: '#12110F', border: '1px solid #21201D', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, color: '#F5F5F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName}</div>
                                            <div style={{ fontSize: '10px', color: '#78716C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.handle}</div>
                                        </div>
                                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#84CC16', flexShrink: 0 }} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="plasticin-chat-sidebar-footer">
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Radio size={11} color={isRealtimeConnected ? '#C8F931' : '#78716C'} />
                                <span>{isRealtimeConnected ? 'Realtime Live' : 'Connecting...'}</span>
                            </span>
                            <span style={{ fontFamily: 'monospace', fontSize: '10px' }}>{currentHandle}</span>
                        </div>
                    </aside>

                    {/* Main Conversation Pane */}
                    <section className="plasticin-chat-main">
                        <div className="plasticin-chat-room-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                <button
                                    type="button"
                                    className="plasticin-chat-back-btn"
                                    onClick={() => setActiveSlide('directory')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '5px 8px',
                                        borderRadius: '6px',
                                        background: '#21201D',
                                        border: '1px solid #33312C',
                                        color: '#D6D3D1',
                                        fontSize: '11px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <ChevronLeft size={13} />
                                    <span>Channels</span>
                                </button>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: '#F5F5F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {activeRoomTitle}
                                        </span>
                                        <span style={{ padding: '2px 7px', borderRadius: '999px', fontSize: '10px', background: '#21201D', border: '1px solid #33312C', color: '#A8A29E' }}>
                                            {activeRoom?.roomType === 'management' ? 'Management' : 'Workspace'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#78716C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {activeRoom?.topic || `${currentOrgName} synchronized room`}
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('chat')}
                                    style={{
                                        padding: '5px 10px',
                                        borderRadius: '7px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        cursor: 'pointer',
                                        background: activeView === 'chat' ? 'rgba(200,249,49,0.14)' : '#21201D',
                                        border: `1px solid ${activeView === 'chat' ? 'rgba(200,249,49,0.35)' : '#33312C'}`,
                                        color: activeView === 'chat' ? '#C8F931' : '#A8A29E',
                                    }}
                                >
                                    <MessageSquare size={13} />
                                    <span>Chat</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveView('inbox')}
                                    style={{
                                        padding: '5px 10px',
                                        borderRadius: '7px',
                                        fontSize: '11.5px',
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        cursor: 'pointer',
                                        background: activeView === 'inbox' ? 'rgba(200,249,49,0.14)' : '#21201D',
                                        border: `1px solid ${activeView === 'inbox' ? 'rgba(200,249,49,0.35)' : '#33312C'}`,
                                        color: activeView === 'inbox' ? '#C8F931' : '#A8A29E',
                                    }}
                                >
                                    <Inbox size={13} />
                                    <span>Files</span>
                                </button>
                            </div>
                        </div>

                        {activeView === 'chat' && pinnedMessages.length > 0 && (
                            <div style={{ padding: '7px 16px', borderBottom: '1px solid #33312C', background: '#1C1B18', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#D6D3D1', flexShrink: 0 }}>
                                <Pin size={13} color="#C8F931" style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    <strong>Pinned:</strong> {sanitizeDisplayText(pinnedMessages[pinnedMessages.length - 1].content, 160)}
                                </span>
                            </div>
                        )}

                        <div className="plasticin-chat-messages">
                            {loadingMessages && messages.length === 0 ? (
                                <div style={{ margin: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#A8A29E' }}>
                                    <Loader2 size={16} className="vizja-spin" color="#C8F931" />
                                    <span>Synchronizing Plasticin Chat Hub...</span>
                                </div>
                            ) : activeView === 'inbox' ? (
                                inboxFiles.length === 0 ? (
                                    <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#78716C' }}>
                                        <FileText size={28} />
                                        <span>No files shared in this channel yet.</span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                                        {inboxFiles.map((f) => {
                                            const safeUrl = sanitizeSafeUrl(f.url, false);
                                            return (
                                                <div key={f.id} style={{ padding: '10px 12px', borderRadius: '8px', background: '#171614', border: '1px solid #33312C', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#F5F5F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {sanitizeDisplayText(f.name, 120)}
                                                        </div>
                                                        <div style={{ fontSize: '10px', color: '#78716C' }}>
                                                            {sanitizeDisplayText(f.uploaderHandle, 64)} · {(f.sizeBytes / 1024).toFixed(1)} KB
                                                        </div>
                                                    </div>
                                                    {safeUrl && safeUrl !== '#' && (
                                                        <a href={safeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#C8F931' }}>
                                                            Open
                                                        </a>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            ) : messages.length === 0 ? (
                                <div style={{ margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#78716C' }}>
                                    <Users size={28} />
                                    <span>No messages in this channel yet. Start the conversation below.</span>
                                </div>
                            ) : (
                                messages.map((msg) => {
                                    const safeAvatar = sanitizeSafeUrl(msg.senderAvatarUrl, true);
                                    const displayName = sanitizeDisplayText(msg.senderDisplayName || msg.senderHandle, 64);
                                    const handle = sanitizeDisplayText(msg.senderHandle, 64);
                                    const content = sanitizeDisplayText(msg.content, 10000);

                                    return (
                                        <div key={msg.id} className="plasticin-chat-msg-card">
                                            <div className="plasticin-chat-msg-avatar">
                                                {safeAvatar ? (
                                                    <img src={safeAvatar} alt={displayName} />
                                                ) : (
                                                    <span>{displayName.slice(0, 1).toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#F5F5F4' }}>{displayName}</span>
                                                        <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#78716C' }}>{handle}</span>
                                                        <span style={{ fontSize: '10px', color: '#78716C' }}>
                                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleReaction(msg.id, '👍')}
                                                            style={{ padding: '2px 6px', borderRadius: '6px', background: '#21201D', border: '1px solid #33312C', fontSize: '11px', cursor: 'pointer' }}
                                                            title="React"
                                                        >
                                                            👍
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleTogglePin(msg.id)}
                                                            style={{ padding: '4px', borderRadius: '6px', background: '#21201D', border: '1px solid #33312C', color: msg.isPinned ? '#C8F931' : '#A8A29E', cursor: 'pointer', display: 'flex' }}
                                                            title="Pin message"
                                                        >
                                                            <Pin size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '12.5px', color: '#E7E5E4', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                                                    {content}
                                                </div>
                                                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingTop: '2px' }}>
                                                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                                                            <button
                                                                key={emoji}
                                                                type="button"
                                                                onClick={() => handleToggleReaction(msg.id, emoji)}
                                                                style={{ padding: '2px 8px', borderRadius: '999px', background: '#21201D', border: '1px solid #33312C', color: '#D6D3D1', fontSize: '11px', cursor: 'pointer' }}
                                                            >
                                                                {emoji} {users.length}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        <form className="plasticin-chat-composer" onSubmit={handleSendMessage}>
                            {sendError && (
                                <div style={{ padding: '6px 10px', borderRadius: '8px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#fca5a5', fontSize: '12px' }}>
                                    {sendError}
                                </div>
                            )}
                            <div className="plasticin-chat-composer-row">
                                <textarea
                                    rows={1}
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder={`Message ${activeRoomTitle}...`}
                                    className="plasticin-chat-textarea"
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim() || sendingMessage}
                                    className="plasticin-chat-send-btn"
                                >
                                    {sendingMessage ? <Loader2 size={14} className="vizja-spin" /> : <Send size={14} />}
                                    <span>Send</span>
                                </button>
                            </div>
                        </form>
                    </section>
                </div>

                {isAnnounceModalOpen && (
                    <div
                        onClick={() => setIsAnnounceModalOpen(false)}
                        style={{ position: 'fixed', inset: 0, zIndex: 10050, background: 'rgba(18,17,15,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
                    >
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '100%', maxWidth: '440px', background: '#171614', border: '1px solid #33312C', borderRadius: '12px', overflow: 'hidden' }}
                        >
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid #33312C', background: '#12110F', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '12px', fontWeight: 600 }}>Management Announcement</span>
                                <button type="button" onClick={() => setIsAnnounceModalOpen(false)} style={{ background: 'transparent', border: 'none', color: '#A8A29E', cursor: 'pointer' }}>
                                    <X size={15} />
                                </button>
                            </div>
                            <form onSubmit={handleSendAnnouncement} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {announceError && (
                                    <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', color: '#fca5a5', fontSize: '12px' }}>
                                        {announceError}
                                    </div>
                                )}
                                <input
                                    type="text"
                                    value={announceTitle}
                                    onChange={(e) => setAnnounceTitle(e.target.value)}
                                    placeholder="Announcement title"
                                    maxLength={80}
                                    style={{ padding: '8px 10px', borderRadius: '8px', background: '#12110F', border: '1px solid #33312C', color: '#F5F5F4', fontSize: '12px', outline: 'none' }}
                                />
                                <textarea
                                    rows={4}
                                    value={announceContent}
                                    onChange={(e) => setAnnounceContent(e.target.value)}
                                    placeholder="Broadcast directive across organization rooms..."
                                    required
                                    style={{ padding: '8px 10px', borderRadius: '8px', background: '#12110F', border: '1px solid #33312C', color: '#F5F5F4', fontSize: '12px', outline: 'none', resize: 'none' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button type="button" onClick={() => setIsAnnounceModalOpen(false)} style={{ padding: '6px 12px', borderRadius: '8px', background: '#21201D', border: '1px solid #33312C', color: '#D6D3D1', fontSize: '12px', cursor: 'pointer' }}>
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={sendingAnnounce || !announceContent.trim()} style={{ padding: '6px 14px', borderRadius: '8px', background: '#C8F931', border: 'none', color: '#12110F', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                                        {sendingAnnounce ? 'Broadcasting...' : 'Broadcast'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlasticinChatModal;
