import { supabase } from './supabase';
import { getTargetUserIds } from './journalStoryService';

export interface JournalRealtimeSyncPayload {
    type: 'clip_saved' | 'clip_deleted' | 'shared_updated' | 'order_changed';
    userId?: string;
    date?: string;
    clipId?: string;
    timestamp?: number;
}

let activeChannel: ReturnType<typeof supabase.channel> | null = null;
let currentSubscribedUserId: string | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownClipSignature: string | null = null;

/**
 * Dispatches sync events to local window so components can update reactively.
 */
function dispatchLocalEvent(payload: JournalRealtimeSyncPayload) {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent('journal_realtime_sync', { detail: payload }));

    if (payload.type === 'clip_saved' || payload.type === 'clip_deleted') {
        window.dispatchEvent(new CustomEvent('journal_clip_saved', { detail: { date: payload.date } }));
    } else if (payload.type === 'shared_updated') {
        window.dispatchEvent(new CustomEvent('journal_shared_updated', { detail: { date: payload.date } }));
    }
}

/**
 * Broadcasts an event to all open devices and tabs logged into the same account
 * via Supabase Realtime WebSocket broadcast.
 */
export async function broadcastJournalSync(payload: JournalRealtimeSyncPayload): Promise<void> {
    const fullPayload: JournalRealtimeSyncPayload = {
        ...payload,
        timestamp: Date.now()
    };

    // 1. Dispatch locally on current device immediately
    dispatchLocalEvent(fullPayload);

    // 2. Broadcast to all other devices via Realtime channel
    if (activeChannel) {
        try {
            await activeChannel.send({
                type: 'broadcast',
                event: 'journal_sync',
                payload: fullPayload
            });
        } catch (err) {
            console.warn('[RealtimeSync] Broadcast error:', err);
        }
    }
}

/**
 * Quick, lightweight check to detect if new clips were added or removed
 * by comparing count and newest created_at timestamp.
 */
async function checkClipsDelta(userId: string): Promise<void> {
    try {
        const userIds = getTargetUserIds(userId);
        const { data, count, error } = await supabase
            .from('journal_clips')
            .select('id, created_at', { count: 'exact' })
            .in('user_id', userIds)
            .order('created_at', { ascending: false })
            .limit(1);

        if (error) return;

        const newestId = data?.[0]?.id || 'none';
        const newestCreatedAt = data?.[0]?.created_at || 'none';
        const totalCount = count ?? 0;
        const currentSignature = `${totalCount}_${newestId}_${newestCreatedAt}`;

        if (lastKnownClipSignature === null) {
            lastKnownClipSignature = currentSignature;
            return;
        }

        if (lastKnownClipSignature !== currentSignature) {
            lastKnownClipSignature = currentSignature;
            dispatchLocalEvent({
                type: 'clip_saved',
                userId,
                timestamp: Date.now()
            });
        }
    } catch (err) {
        console.warn('[RealtimeSync] Delta check error:', err);
    }
}

/**
 * Initializes cross-device realtime synchronization for the logged-in user:
 * 1. Supabase Realtime broadcast channel (instant <50ms push across active devices)
 * 2. Supabase postgres_changes listener on journal_clips, journal_entries, and ideas
 * 3. Window focus and visibility listener (instant refresh when returning to tab)
 * 4. Lightweight background heartbeat (every 6 seconds while tab is active)
 */
export function initJournalRealtime(userId?: string | null): () => void {
    if (!userId) return () => {};

    // Reuse channel if already subscribed for the same user
    if (activeChannel && currentSubscribedUserId === userId) {
        return () => {};
    }

    // Clean up previous subscription if user changed
    if (activeChannel) {
        try {
            supabase.removeChannel(activeChannel);
        } catch {}
        activeChannel = null;
    }

    currentSubscribedUserId = userId;
    const targetUserIds = getTargetUserIds(userId);
    const channelName = `realtime_journal_${userId}`;

    const channel = supabase.channel(channelName, {
        config: {
            broadcast: { self: false }, // Avoid duplicate self-events since broadcastJournalSync dispatches locally
        }
    });

    // 1. Listen for cross-device broadcast messages
    channel.on('broadcast', { event: 'journal_sync' }, (message) => {
        const payload = message?.payload as JournalRealtimeSyncPayload;
        if (!payload) return;

        const senderId = payload.userId;
        if (!senderId || targetUserIds.includes(senderId)) {
            dispatchLocalEvent(payload);
        }
    });

    // 2. Listen for direct PostgreSQL database changes on journal_clips
    channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'journal_clips'
    }, (payload) => {
        const rowUserId = (payload.new as any)?.user_id || (payload.old as any)?.user_id;
        if (!rowUserId || targetUserIds.includes(rowUserId)) {
            const date = (payload.new as any)?.clip_date || (payload.old as any)?.clip_date;
            dispatchLocalEvent({
                type: payload.eventType === 'DELETE' ? 'clip_deleted' : 'clip_saved',
                userId: rowUserId,
                date,
                clipId: (payload.new as any)?.id || (payload.old as any)?.id,
                timestamp: Date.now()
            });
        }
    });

    // 3. Listen for PostgreSQL changes on journal_entries (chat & daily video sequence cards)
    channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'journal_entries'
    }, (payload) => {
        const rowUserId = (payload.new as any)?.user_id || (payload.old as any)?.user_id;
        if (!rowUserId || targetUserIds.includes(rowUserId)) {
            const date = (payload.new as any)?.entry_date || (payload.old as any)?.entry_date;
            dispatchLocalEvent({
                type: 'clip_saved',
                userId: rowUserId,
                date,
                timestamp: Date.now()
            });
        }
    });

    // 4. Listen for PostgreSQL changes on ideas (daily story share records)
    channel.on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ideas'
    }, (payload) => {
        const rowUserId = (payload.new as any)?.user_id || (payload.old as any)?.user_id;
        if (!rowUserId || targetUserIds.includes(rowUserId)) {
            dispatchLocalEvent({
                type: 'shared_updated',
                userId: rowUserId,
                timestamp: Date.now()
            });
        }
    });

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            // Check immediately on connect
            checkClipsDelta(userId);
        }
    });

    activeChannel = channel;

    // Window focus and visibility change listeners for instant refresh
    const handleVisibility = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            checkClipsDelta(userId);
        }
    };

    const handleFocus = () => {
        checkClipsDelta(userId);
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
    }

    // Heartbeat delta check every 6 seconds while the document is active
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            checkClipsDelta(userId);
        }
    }, 6000);

    return () => {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
        if (typeof window !== 'undefined') {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        }
        if (activeChannel) {
            try {
                supabase.removeChannel(activeChannel);
            } catch {}
            activeChannel = null;
            currentSubscribedUserId = null;
        }
    };
}
