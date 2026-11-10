/**
 * journalTrashStorage.ts — yolofuck
 * Client-side and Supabase-compatible Trash Bin storage for deleted clips.
 * Keeps deleted clips until permanently purged or restored.
 */

export interface TrashClipItem {
    id: string;
    originalClipId: string;
    clip_url: string;
    thumbnail_url?: string | null;
    transcription?: string | null;
    duration_ms?: number;
    clip_date: string;
    deleted_at: string;
    source: 'journal' | 'share';
}

const TRASH_STORAGE_KEY = 'yolofuck_trash_bin_clips';

function getStorageKey(userId?: string): string {
    return userId ? `${TRASH_STORAGE_KEY}_${userId}` : TRASH_STORAGE_KEY;
}

export function getTrashClips(userId?: string): TrashClipItem[] {
    try {
        const key = getStorageKey(userId);
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

export function moveToTrash(clip: {
    id: string;
    clip_url: string;
    thumbnail_url?: string | null;
    transcription?: string | null;
    duration_ms?: number;
    clip_date?: string;
    created_at?: string;
}, source: 'journal' | 'share' = 'journal', userId?: string): void {
    try {
        const key = getStorageKey(userId);
        const current = getTrashClips(userId);
        const date = clip.clip_date || (clip.created_at ? clip.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10));
        const item: TrashClipItem = {
            id: `trash_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            originalClipId: clip.id,
            clip_url: clip.clip_url,
            thumbnail_url: clip.thumbnail_url || null,
            transcription: clip.transcription || null,
            duration_ms: clip.duration_ms || 5000,
            clip_date: date,
            deleted_at: new Date().toISOString(),
            source
        };
        const updated = [item, ...current];
        localStorage.setItem(key, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('yolofuck_trash_updated'));
    } catch (e) {
        console.warn('[TrashStorage] Failed to move clip to trash:', e);
    }
}

export function removeSingleTrashClip(id: string, userId?: string): void {
    try {
        const key = getStorageKey(userId);
        const current = getTrashClips(userId);
        const updated = current.filter(item => item.id !== id);
        localStorage.setItem(key, JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('yolofuck_trash_updated'));
    } catch (e) {
        console.warn('[TrashStorage] Failed to remove clip from trash:', e);
    }
}

export function clearAllTrashClips(userId?: string): void {
    try {
        const key = getStorageKey(userId);
        localStorage.removeItem(key);
        window.dispatchEvent(new CustomEvent('yolofuck_trash_updated'));
    } catch (e) {
        console.warn('[TrashStorage] Failed to clear trash:', e);
    }
}
