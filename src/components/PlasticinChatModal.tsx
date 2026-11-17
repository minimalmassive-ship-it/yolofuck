import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    MessageSquare,
    Send,
    Paperclip,
    X,
    ExternalLink,
    ChevronLeft,
    Hash,
    Users,
    Search,
    Radio,
    Sparkles,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabaseAuth } from '../lib/supabase';
import './PlasticinChatModal.css';

export interface ChatRoomMeta {
    id: string;
    name: string;
    topic: string;
    appTarget: 'memcut' | 'ideanite' | 'archimantis' | 'nancat' | 'woobsy' | 'ecosystem';
    roomType: 'workspace' | 'management' | 'direct';
    badgeLabel: string;
    isPrimary?: boolean;
}

export interface ChatParticipant {
    id: string;
    handle: string;
    displayName: string;
    role: string;
    organizationName: string;
    isOnline: boolean;
    avatarUrl?: string;
}

export interface EcosystemChatMessage {
    id: string;
    roomId: string;
    senderHandle: string;
    senderDisplayName: string;
    senderAvatarUrl?: string;
    content: string;
    createdAt: string;
    isSelf?: boolean;
}

export interface PlasticinChatModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialRoomId?: string;
}

const DEFAULT_ECOSYSTEM_ROOMS: ChatRoomMeta[] = [
    {
        id: 'room_memcut_journal',
        name: 'memcut-journal',
        topic: 'Daily spoken-word video journal & clip synchronization (system_type: journal)',
        appTarget: 'memcut',
        roomType: 'workspace',
        badgeLabel: 'Memcut Journal',
        isPrimary: true,
    },
    {
        id: 'room_singularity_mgmt',
        name: 'singularity-governance',
        topic: 'Singularity 3 ecosystem leadership & directives',
        appTarget: 'ecosystem',
        roomType: 'management',
        badgeLabel: 'Singularity',
    },
    {
        id: 'room_ideanite_innovation',
        name: 'ideanite-innovation',
        topic: 'Shared product ideas, boards & collaborative canvas',
        appTarget: 'ideanite',
        roomType: 'workspace',
        badgeLabel: 'Ideanite',
    },
    {
        id: 'room_archimantis_model',
        name: 'archimantis-togaf',
        topic: 'Enterprise TOGAF architecture and BPMN system models',
        appTarget: 'archimantis',
        roomType: 'workspace',
        badgeLabel: 'ArchiMantis',
    },
    {
        id: 'room_nancat_video',
        name: 'nancat-studio',
        topic: 'NanCat video workspace & Instagram ingest pipelines',
        appTarget: 'nancat',
        roomType: 'workspace',
        badgeLabel: 'NanCat',
    },
    {
        id: 'room_woobsy_flow',
        name: 'woobsy-workflow',
        topic: 'Automation engine and ecosystem micro-services',
        appTarget: 'woobsy',
        roomType: 'workspace',
        badgeLabel: 'Woobsy',
    },
];

const INITIAL_CONVERSATION_HISTORY: Record<string, EcosystemChatMessage[]> = {
    room_memcut_journal: [
        {
            id: 'msg_init_memcut_1',
            roomId: 'room_memcut_journal',
            senderHandle: '@antigravity-agent',
            senderDisplayName: 'Antigravity AI Agent',
            content: 'Welcome to the synchronized ecosystem chat! Your Memcut journal session is active under Plasticin ID (`igrxuwvlnpthvrbfhlpu`).',
            createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
        },
        {
            id: 'msg_init_memcut_2',
            roomId: 'room_memcut_journal',
            senderHandle: '@antigravity-agent',
            senderDisplayName: 'Antigravity AI Agent',
            content: 'Journal takes recorded in Memcut can link to Ideanite workspaces (`system_type: "journal"`), and cross-post updates to team channels.',
            createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        },
    ],
    room_ideanite_innovation: [
        {
            id: 'msg_init_idea_1',
            roomId: 'room_ideanite_innovation',
            senderHandle: '@antigravity-agent',
            senderDisplayName: 'Antigravity AI Agent',
            content: 'Ideanite product canvas connected to Plasticin ID Master Auth. Workspaces are synchronized across all ecosystem applications.',
            createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        },
    ],
};

export const PlasticinChatModal: React.FC<PlasticinChatModalProps> = ({
    isOpen,
    onClose,
    initialRoomId = 'room_memcut_journal',
}) => {
    const { user, profile } = useAuth();

    const [activeSlide, setActiveSlide] = useState<'directory' | 'conversation'>('conversation');
    const [activeRoomId, setActiveRoomId] = useState<string>(initialRoomId);
    const [searchQuery, setSearchQuery] = useState('');
    const [inputText, setInputText] = useState('');
    const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

    // Messages state mapped by roomId
    const [messagesState, setMessagesState] = useState<Record<string, EcosystemChatMessage[]>>(() => {
        try {
            const saved = localStorage.getItem('plasticin_chat_cached_messages');
            if (saved) {
                const parsed = JSON.parse(saved);
                return { ...INITIAL_CONVERSATION_HISTORY, ...parsed };
            }
        } catch {
            // ignore
        }
        return INITIAL_CONVERSATION_HISTORY;
    });

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Touch swipe gesture tracking
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const [touchOffset, setTouchOffset] = useState<number>(0);

    // Identify current user handle and display name
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
        return profile?.username || user?.user_metadata?.username || currentHandle.replace(/^@/, '');
    }, [profile?.username, user?.user_metadata?.username, currentHandle]);

    // Directory Users list
    const directoryUsers = useMemo<ChatParticipant[]>(() => {
        return [
            {
                id: 'usr_plst_antigravity',
                handle: '@antigravity-agent',
                displayName: 'Antigravity AI Agent',
                role: 'Autonomous Engineering Co-pilot',
                organizationName: 'Plasticin Platform',
                isOnline: true,
            },
            {
                id: 'usr_plst_acidplasticine',
                handle: '@acidplasticine',
                displayName: 'acidplasticine',
                role: 'Platform Founder & Lead Architect',
                organizationName: 'Singularity 3',
                isOnline: true,
            },
            {
                id: user?.id || 'usr_current_guest',
                handle: currentHandle,
                displayName: currentDisplayName,
                role: 'Memcut Member',
                organizationName: 'Singularity 3',
                isOnline: true,
            },
        ];
    }, [user?.id, currentHandle, currentDisplayName]);

    // Active room object
    const activeRoom = useMemo(() => {
        const found = DEFAULT_ECOSYSTEM_ROOMS.find((r) => r.id === activeRoomId);
        if (found) return found;

        if (activeRoomId.startsWith('dm_')) {
            const dmUser = directoryUsers.find((u) => `dm_${u.id}` === activeRoomId);
            if (dmUser) {
                return {
                    id: activeRoomId,
                    name: dmUser.handle,
                    topic: `Direct conversation with ${dmUser.displayName} (${dmUser.role})`,
                    appTarget: 'ecosystem' as const,
                    roomType: 'direct' as const,
                    badgeLabel: 'Direct Message',
                };
            }
        }
        return DEFAULT_ECOSYSTEM_ROOMS[0];
    }, [activeRoomId, directoryUsers]);

    // Filtered rooms & users
    const filteredRooms = useMemo(() => {
        if (!searchQuery.trim()) return DEFAULT_ECOSYSTEM_ROOMS;
        const q = searchQuery.toLowerCase();
        return DEFAULT_ECOSYSTEM_ROOMS.filter(
            (r) => r.name.toLowerCase().includes(q) || r.topic.toLowerCase().includes(q) || r.badgeLabel.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    const filteredUsers = useMemo(() => {
        if (!searchQuery.trim()) return directoryUsers;
        const q = searchQuery.toLowerCase();
        return directoryUsers.filter(
            (u) => u.handle.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || u.role.toLowerCase().includes(q)
        );
    }, [directoryUsers, searchQuery]);

    // Auto-scroll messages
    useEffect(() => {
        if (activeSlide === 'conversation') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messagesState, activeRoomId, activeSlide]);

    // Close on escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Realtime Supabase Channel Connection
    useEffect(() => {
        if (!isOpen) return;

        const channel = supabaseAuth.channel(`plasticin_chat_${activeRoomId}`, {
            config: {
                broadcast: { ack: false, self: false },
                presence: { key: currentHandle },
            },
        });

        channel
            .on('broadcast', { event: 'new_message' }, ({ payload }) => {
                if (payload?.message && payload.message.roomId === activeRoomId) {
                    setMessagesState((prev) => {
                        const existing = prev[activeRoomId] || [];
                        if (existing.some((m) => m.id === payload.message.id)) return prev;
                        const updated = {
                            ...prev,
                            [activeRoomId]: [...existing, payload.message],
                        };
                        try {
                            localStorage.setItem('plasticin_chat_cached_messages', JSON.stringify(updated));
                        } catch {
                            // ignore storage error
                        }
                        return updated;
                    });
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setIsRealtimeConnected(true);
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    setIsRealtimeConnected(false);
                }
            });

        return () => {
            setIsRealtimeConnected(false);
            supabaseAuth.removeChannel(channel);
        };
    }, [isOpen, activeRoomId, currentHandle]);

    // Handle touch gesture for horizontal swipe between View 1 and View 2
    const handleTouchStart = (e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
        };
        setTouchOffset(0);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;
        const touch = e.touches[0];
        const diffX = touch.clientX - touchStartRef.current.x;
        const diffY = touch.clientY - touchStartRef.current.y;

        // If movement is predominantly horizontal, track offset
        if (Math.abs(diffX) > Math.abs(diffY)) {
            setTouchOffset(diffX);
        }
    };

    const handleTouchEnd = () => {
        if (!touchStartRef.current) return;
        const threshold = 45; // pixels
        const diffX = touchOffset;

        if (activeSlide === 'directory') {
            // Swiping left from directory slides into conversation
            if (diffX < -threshold) {
                setActiveSlide('conversation');
            }
        } else if (activeSlide === 'conversation') {
            // Swiping right from conversation slides back to directory
            if (diffX > threshold) {
                setActiveSlide('directory');
            }
        }

        touchStartRef.current = null;
        setTouchOffset(0);
    };

    // Auto-grow textarea
    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputText(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    };

    // Send chat message
    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const text = inputText.trim();
        if (!text) return;

        const newMsg: EcosystemChatMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            roomId: activeRoomId,
            senderHandle: currentHandle,
            senderDisplayName: currentDisplayName,
            content: text,
            createdAt: new Date().toISOString(),
            isSelf: true,
        };

        // Optimistic local state update
        setMessagesState((prev) => {
            const list = prev[activeRoomId] || [];
            const nextList = [...list, newMsg];
            const updated = { ...prev, [activeRoomId]: nextList };
            try {
                localStorage.setItem('plasticin_chat_cached_messages', JSON.stringify(updated));
            } catch {
                // ignore
            }
            return updated;
        });

        setInputText('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        // Broadcast to other peers via Supabase Realtime channel
        try {
            const channel = supabaseAuth.channel(`plasticin_chat_${activeRoomId}`);
            await channel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: { message: newMsg },
            });
        } catch (err) {
            console.warn('[PlasticinChat] Broadcast message notice:', err);
        }
    };

    const handleKeyDownInComposer = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    if (!isOpen) return null;

    const currentRoomMessages = messagesState[activeRoomId] || [];

    return (
        <div className="plasticin-chat-backdrop" onClick={onClose}>
            <div
                className="plasticin-chat-window"
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {/* ── Top Bar with Co-Branding & Swipe Switcher ── */}
                <header className="plasticin-chat-header">
                    <div className="plasticin-chat-brand-group">
                        <div className="plasticin-chat-brand-pill" title="Plasticin Central Gateway">
                            <img
                                src="/assets/plasticin_icon.png"
                                alt="Plasticin"
                                className="plasticin-chat-brand-icon"
                            />
                            <span className="plasticin-chat-brand-name">Plasticin Chat</span>
                        </div>

                        <div className="plasticin-chat-brand-divider" />

                        <div className="plasticin-chat-memcut-tag" title="Connected Client">
                            <img
                                src="/memcut-glyph.png"
                                alt="Memcut"
                                className="plasticin-chat-memcut-glyph"
                            />
                            <span className="plasticin-chat-memcut-label">Memcut</span>
                        </div>
                    </div>

                    {/* Central Horizontal Swipe Switcher */}
                    <div className="plasticin-chat-swipe-nav" role="tablist">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeSlide === 'directory'}
                            className={`plasticin-chat-swipe-pill ${activeSlide === 'directory' ? 'active' : ''}`}
                            onClick={() => setActiveSlide('directory')}
                            title="Swipe or click for Directory & Workspaces"
                        >
                            <Users size={13} />
                            <span>Workspaces</span>
                        </button>

                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeSlide === 'conversation'}
                            className={`plasticin-chat-swipe-pill ${activeSlide === 'conversation' ? 'active' : ''}`}
                            onClick={() => setActiveSlide('conversation')}
                            title="Swipe or click for Active Room"
                        >
                            <MessageSquare size={13} />
                            <span>#{activeRoom.name}</span>
                        </button>

                        <div className="plasticin-chat-nav-indicator">
                            <span className={`plasticin-chat-nav-dot ${activeSlide === 'directory' ? 'active' : ''}`} />
                            <span className={`plasticin-chat-nav-dot ${activeSlide === 'conversation' ? 'active' : ''}`} />
                        </div>
                    </div>

                    {/* Top Right Actions */}
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

                {/* ── Swipe Viewport: Track holding View 1 & View 2 ── */}
                <div className="plasticin-chat-viewport">
                    <div
                        className={`plasticin-chat-track ${
                            activeSlide === 'directory' ? 'view-directory' : 'view-conversation'
                        }`}
                    >
                        {/* ── View 1: Organizations, Workspaces & Users Directory ── */}
                        <section className="plasticin-chat-panel plasticin-chat-directory-panel">
                            <div className="plasticin-chat-search-wrap">
                                <div className="plasticin-chat-search-bar">
                                    <Search size={14} color="#78716c" />
                                    <input
                                        type="text"
                                        placeholder="Search workspaces or members..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="plasticin-chat-search-input"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery('')}
                                            className="plasticin-chat-icon-btn"
                                            title="Clear"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="plasticin-chat-directory-scroll">
                                {/* Ecosystem Workspaces Section */}
                                <div>
                                    <div className="plasticin-chat-section-title">
                                        <span>Ecosystem Workspaces</span>
                                        <span>{filteredRooms.length}</span>
                                    </div>
                                    <div className="plasticin-chat-rooms-list">
                                        {filteredRooms.map((room) => {
                                            const isActive = activeRoomId === room.id;
                                            return (
                                                <div
                                                    key={room.id}
                                                    className={`plasticin-chat-room-item ${isActive ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setActiveRoomId(room.id);
                                                        setActiveSlide('conversation'); // Slide to chat on select
                                                    }}
                                                >
                                                    <div className="plasticin-chat-room-left">
                                                        <div className="plasticin-chat-room-icon-box">
                                                            <Hash size={14} />
                                                        </div>
                                                        <div className="plasticin-chat-room-meta">
                                                            <div className="plasticin-chat-room-name-row">
                                                                <span className="plasticin-chat-room-name">
                                                                    {room.name}
                                                                </span>
                                                                <span
                                                                    className={`plasticin-chat-app-badge ${
                                                                        room.isPrimary ? 'primary' : ''
                                                                    }`}
                                                                >
                                                                    {room.badgeLabel}
                                                                </span>
                                                            </div>
                                                            <span className="plasticin-chat-room-desc">
                                                                {room.topic}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Active Members & Direct Messages Section */}
                                <div>
                                    <div className="plasticin-chat-section-title">
                                        <span>Direct Messages & Co-Pilots</span>
                                        <span>{filteredUsers.length}</span>
                                    </div>
                                    <div className="plasticin-chat-users-list">
                                        {filteredUsers.map((u) => {
                                            const dmRoomId = `dm_${u.id}`;
                                            const isActive = activeRoomId === dmRoomId;
                                            return (
                                                <div
                                                    key={u.id}
                                                    className={`plasticin-chat-user-item ${isActive ? 'active' : ''}`}
                                                    onClick={() => {
                                                        setActiveRoomId(dmRoomId);
                                                        setActiveSlide('conversation'); // Slide to chat on select
                                                    }}
                                                >
                                                    <div className="plasticin-chat-user-left">
                                                        <div className="plasticin-chat-avatar-wrap">
                                                            {u.avatarUrl ? (
                                                                <img
                                                                    src={u.avatarUrl}
                                                                    alt={u.displayName}
                                                                    className="plasticin-chat-avatar"
                                                                />
                                                            ) : (
                                                                <div className="plasticin-chat-avatar-placeholder">
                                                                    {u.handle.slice(1, 2).toUpperCase()}
                                                                </div>
                                                            )}
                                                            <span
                                                                className={`plasticin-chat-status-dot ${
                                                                    u.isOnline ? 'online' : 'offline'
                                                                }`}
                                                            />
                                                        </div>
                                                        <div className="plasticin-chat-user-meta">
                                                            <span className="plasticin-chat-user-name">
                                                                {u.displayName} <small style={{ color: '#78716c' }}>{u.handle}</small>
                                                            </span>
                                                            <span className="plasticin-chat-user-role">
                                                                {u.role} · {u.organizationName}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* ── View 2: Active Chat Conversation Panel ── */}
                        <section className="plasticin-chat-panel plasticin-chat-conversation-panel">
                            {/* Room Header with Back Button */}
                            <div className="plasticin-chat-room-header">
                                <div className="plasticin-chat-room-header-left">
                                    <button
                                        type="button"
                                        onClick={() => setActiveSlide('directory')}
                                        className="plasticin-chat-back-btn"
                                        title="Slide to Directory (or swipe right)"
                                    >
                                        <ChevronLeft size={14} />
                                        <span>Workspaces</span>
                                    </button>

                                    <div className="plasticin-chat-room-header-info">
                                        <div className="plasticin-chat-room-header-title-row">
                                            <span className="plasticin-chat-room-header-title">
                                                {activeRoom.roomType === 'direct' ? '' : '#'}
                                                {activeRoom.name}
                                            </span>
                                            <span className="plasticin-chat-gateway-badge">
                                                <Radio size={10} className={isRealtimeConnected ? 'vizja-pulse' : ''} />
                                                <span>{isRealtimeConnected ? 'Live' : 'Standby'}</span>
                                            </span>
                                        </div>
                                        <span className="plasticin-chat-room-header-topic">
                                            {activeRoom.topic}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Messages Container */}
                            <div className="plasticin-chat-messages-container">
                                {currentRoomMessages.length === 0 ? (
                                    <div className="plasticin-chat-empty-stream">
                                        <Sparkles className="plasticin-chat-empty-icon" />
                                        <span style={{ fontWeight: 600, color: '#e7e5e4' }}>
                                            Beginning of #{activeRoom.name}
                                        </span>
                                        <span style={{ fontSize: '11.5px' }}>
                                            Send a message below to start the conversation across the Plasticin ecosystem.
                                        </span>
                                    </div>
                                ) : (
                                    currentRoomMessages.map((msg) => {
                                        const isSelf = msg.isSelf || msg.senderHandle === currentHandle;
                                        return (
                                            <div
                                                key={msg.id}
                                                className={`plasticin-chat-message-bubble ${
                                                    isSelf ? 'is-self' : ''
                                                }`}
                                            >
                                                <div className="plasticin-chat-msg-avatar">
                                                    {msg.senderAvatarUrl ? (
                                                        <img src={msg.senderAvatarUrl} alt={msg.senderDisplayName} />
                                                    ) : (
                                                        <span>{msg.senderHandle.slice(1, 2).toUpperCase()}</span>
                                                    )}
                                                </div>
                                                <div className="plasticin-chat-msg-body">
                                                    <div className="plasticin-chat-msg-header">
                                                        <span className="plasticin-chat-msg-sender">
                                                            {msg.senderDisplayName}
                                                        </span>
                                                        <span>{msg.senderHandle}</span>
                                                        <span>·</span>
                                                        <span>
                                                            {new Date(msg.createdAt).toLocaleTimeString([], {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })}
                                                        </span>
                                                    </div>
                                                    <div className="plasticin-chat-msg-bubble-box">
                                                        {msg.content}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Composer */}
                            <form className="plasticin-chat-composer-wrap" onSubmit={handleSendMessage}>
                                <div className="plasticin-chat-composer-box">
                                    <textarea
                                        ref={textareaRef}
                                        rows={1}
                                        value={inputText}
                                        onChange={handleTextareaChange}
                                        onKeyDown={handleKeyDownInComposer}
                                        placeholder={`Message #${activeRoom.name}...`}
                                        className="plasticin-chat-textarea"
                                    />
                                    <div className="plasticin-chat-composer-footer">
                                        <div className="plasticin-chat-composer-actions">
                                            <button
                                                type="button"
                                                className="plasticin-chat-icon-btn"
                                                title="Attach media clip"
                                            >
                                                <Paperclip size={14} />
                                            </button>
                                        </div>
                                        <span style={{ fontSize: '10.5px', color: '#78716c' }}>
                                            Enter to send · Shift+Enter for newline
                                        </span>
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={!inputText.trim()}
                                    className="plasticin-chat-send-btn"
                                    title="Send message"
                                >
                                    <Send size={15} />
                                </button>
                            </form>
                        </section>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlasticinChatModal;
