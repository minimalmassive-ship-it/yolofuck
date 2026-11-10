/**
 * journalStoryService.ts v1.0.0
 *
 * Data service layer for the Journal Story system.
 * Handles CRUD operations for journal entries (chat messages) and
 * individual video clips, plus storage uploads and daily merge logic.
 */

import { supabase } from './supabase';

// ── Types ──────────────────────────────────────────────────────────────────

export interface JournalEntry {
    id: string;
    user_id: string;
    project_id: string | null;
    entry_type: 'text' | 'image' | 'video';
    content: string | null;
    video_url: string | null;
    thumbnail_url: string | null;
    transcription: string | null;
    entry_date: string; // ISO date 'YYYY-MM-DD'
    is_public?: boolean;
    published_at?: string | null;
    published_idea_id?: string | null;
    created_at: string;
    updated_at: string;
}

export interface JournalClip {
    id: string;
    user_id: string;
    project_id: string | null;
    clip_url: string;
    thumbnail_url: string | null;
    transcription: string | null;
    duration_ms: number;
    clip_order: number;
    clip_date: string; // ISO date 'YYYY-MM-DD'
    is_merged: boolean;
    created_at: string;
    original_take_number?: number;
}

// ── Pending Date Bridge ────────────────────────────────────────────────────

let pendingStoryDate: string | null = null;

/** Store a target story date before switching tabs so the player can load it immediately */
export function setPendingStoryDate(date: string | null) {
    pendingStoryDate = date;
}

/** Retrieve and clear the pending target story date */
export function getPendingStoryDate(): string | null {
    const d = pendingStoryDate;
    pendingStoryDate = null;
    return d;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Get today's date in ISO format (YYYY-MM-DD) using local timezone */
export function getLocalDateISO(date?: Date): string {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Generate a unique, author-bound deterministic slug for sharing daily stories */
export function generateUniqueStorySlug(username: any, userId: any, date: any): string {
    const rawUser = typeof username === 'string' ? username : (typeof username === 'number' ? String(username) : 'user');
    const cleanUser = rawUser
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 16) || 'user';
    const rawId = typeof userId === 'string' ? userId : '';
    const userShort = rawId.replace(/-/g, '').slice(0, 6) || 'story';
    const cleanDate = typeof date === 'string' && date ? date : getLocalDateISO();
    return `${cleanUser}-story-${cleanDate}-${userShort}`;
}

/** Generate a unique filename for storage uploads */
function generateStoragePath(userId: string, filename: string): string {
    const timestamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `${userId}/${timestamp}_${rand}_${filename}`;
}

// ── Entry CRUD ─────────────────────────────────────────────────────────────

/** Fetch all entries for a specific date, ordered by creation time */
export async function fetchEntriesByDate(
    userId: string,
    date: string
): Promise<JournalEntry[]> {
    const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[JournalStory] fetchEntriesByDate error:', error);
        return [];
    }
    return data || [];
}

/** Fetch paginated entries (newest first), grouped by date for the feed */
export async function fetchEntriesPaginated(
    userId: string,
    page: number = 0,
    limit: number = 50
): Promise<JournalEntry[]> {
    const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

    if (error) {
        console.error('[JournalStory] fetchEntriesPaginated error:', error);
        return [];
    }
    return (data || []).reverse(); // Reverse so oldest are at top in feed
}

/** Fetch unmerged clips for a specific date */
export async function fetchUnmergedClips(
    userId: string,
    date: string
): Promise<JournalClip[]> {
    const { data, error } = await supabase
        .from('journal_clips')
        .select('*')
        .eq('user_id', userId)
        .eq('clip_date', date)
        .eq('is_merged', false)
        .order('clip_order', { ascending: true });

    if (error) {
        console.error('[JournalStory] fetchUnmergedClips error:', error);
        return [];
    }
    return data || [];
}

/** Fetch all clips for a specific date (including merged ones) - strictly oldest to newest */
export async function fetchClipsByDate(
    userId: string,
    date: string
): Promise<JournalClip[]> {
    const { data, error } = await supabase
        .from('journal_clips')
        .select('*')
        .eq('user_id', userId)
        .eq('clip_date', date)
        .order('clip_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        console.error('[JournalStory] fetchClipsByDate error:', error);
        return [];
    }
    return data || [];
}

/** Fetch all clips for a user across all dates, sorted by date DESC and clip_order ASC.
 * Includes user clips and any pre-auth/anonymous clips ('local_user', 'anonymous', null)
 */
export async function fetchAllUserClips(
    userId: string
): Promise<JournalClip[]> {
    const { data, error } = await supabase
        .from('journal_clips')
        .select('*')
        .eq('user_id', userId)
        .order('clip_date', { ascending: false })
        .order('clip_order', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        console.warn('[JournalStory] fetchAllUserClips error:', error);
        return [];
    }
    return data || [];
}

// ── Save Operations ────────────────────────────────────────────────────────

/** Capture a frame from video URL and upload as public thumbnail JPEG to storage */
export async function captureAndUploadVideoThumbnail(
    userId: string,
    videoUrl: string,
    prefix: string = 'story'
): Promise<string | null> {
    if (!videoUrl || typeof document === 'undefined') return null;

    try {
        const frameBlob = await new Promise<Blob | null>((resolve) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.src = videoUrl;
            video.muted = true;
            video.playsInline = true;

            const timeout = setTimeout(() => {
                resolve(null);
            }, 6000);

            video.onloadeddata = () => {
                video.currentTime = Math.min(0.5, (video.duration || 1) / 2);
            };

            video.onseeked = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement('canvas');
                    const w = video.videoWidth || 640;
                    const h = video.videoHeight || 640;
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(video, 0, 0, w, h);
                        canvas.toBlob((blob) => {
                            resolve(blob);
                        }, 'image/jpeg', 0.88);
                        return;
                    }
                } catch (e) {
                    console.warn('[Thumbnail] Frame capture failed:', e);
                }
                resolve(null);
            };

            video.onerror = () => {
                clearTimeout(timeout);
                resolve(null);
            };
        });

        if (!frameBlob) return null;

        const path = `${userId}/journal_thumbs/${prefix}_${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage
            .from('idea-images')
            .upload(path, frameBlob, { contentType: 'image/jpeg', upsert: true });

        if (uploadErr) {
            console.warn('[Thumbnail] Storage upload error:', uploadErr);
            return null;
        }

        const { data } = supabase.storage.from('idea-images').getPublicUrl(path);
        return data?.publicUrl || null;
    } catch (err) {
        console.warn('[Thumbnail] captureAndUploadVideoThumbnail error:', err);
        return null;
    }
}

/** Upload a video clip blob to storage and insert a DB row */
export async function saveClip(
    userId: string,
    projectId: string | null,
    clipBlob: Blob,
    transcription: string | null,
    order: number,
    durationMs: number = 0,
    thumbBlob?: Blob | null
): Promise<JournalClip | null> {
    const today = getLocalDateISO();
    const extension = clipBlob.type.includes('mp4') ? 'mp4' : 'webm';
    const storagePath = generateStoragePath(userId, `clip_${order}.${extension}`);

    // 1. Upload video to storage (using established idea-videos bucket with idea-images fallback)
    let uploadErr = null;
    let targetBucket = 'idea-videos';

    const { error: vErr } = await supabase.storage
        .from('idea-videos')
        .upload(storagePath, clipBlob, {
            contentType: clipBlob.type || 'video/webm',
            upsert: false,
        });

    if (vErr) {
        console.warn('[JournalStory] idea-videos upload error, trying idea-images fallback:', vErr);
        const { error: imgErr } = await supabase.storage
            .from('idea-images')
            .upload(storagePath, clipBlob, {
                contentType: clipBlob.type || 'video/webm',
                upsert: false,
            });
        if (imgErr) {
            uploadErr = imgErr;
        } else {
            targetBucket = 'idea-images';
        }
    }

    if (uploadErr) {
        console.error('[JournalStory] clip upload error:', uploadErr);
        return null;
    }

    // 2. Get public URL
    const { data: urlData } = supabase.storage
        .from(targetBucket)
        .getPublicUrl(storagePath);

    const clipUrl = urlData?.publicUrl || '';

    // 3. Upload thumbnail if provided
    let thumbnailUrl: string | null = null;
    if (thumbBlob) {
        try {
            const thumbPath = generateStoragePath(userId, `clip_${order}_thumb.jpg`);
            const { error: tErr } = await supabase.storage
                .from('idea-images')
                .upload(thumbPath, thumbBlob, {
                    contentType: 'image/jpeg',
                    upsert: true
                });
            if (!tErr) {
                const { data: tUrlData } = supabase.storage
                    .from('idea-images')
                    .getPublicUrl(thumbPath);
                thumbnailUrl = tUrlData?.publicUrl || null;
            }
        } catch (tErr) {
            console.warn('[JournalStory] Thumbnail upload failed:', tErr);
        }
    }

    // 4. Insert DB row
    const { data, error: insertErr } = await supabase
        .from('journal_clips')
        .insert({
            user_id: userId,
            project_id: projectId,
            clip_url: clipUrl,
            thumbnail_url: thumbnailUrl,
            transcription,
            duration_ms: durationMs,
            clip_order: order,
            clip_date: today,
            is_merged: false,
        })
        .select()
        .single();

    if (insertErr) {
        console.error('[JournalStory] clip insert error:', insertErr);
        return null;
    }

    return data;
}

/** Save a text entry to the journal chat */
export async function saveTextEntry(
    userId: string,
    projectId: string | null,
    text: string
): Promise<JournalEntry | null> {
    const today = getLocalDateISO();

    const { data, error } = await supabase
        .from('journal_entries')
        .insert({
            user_id: userId,
            project_id: projectId,
            entry_type: 'text',
            content: text,
            entry_date: today,
        })
        .select()
        .single();

    if (error) {
        console.error('[JournalStory] saveTextEntry error:', error);
        return null;
    }
    return data;
}

/** Save an image entry to the journal chat */
export async function saveImageEntry(
    userId: string,
    projectId: string | null,
    imageFile: File
): Promise<JournalEntry | null> {
    const today = getLocalDateISO();
    const storagePath = generateStoragePath(userId, imageFile.name);

    // Upload image
    const { error: uploadErr } = await supabase.storage
        .from('idea-images')
        .upload(storagePath, imageFile, {
            contentType: imageFile.type,
            upsert: false,
        });

    if (uploadErr) {
        console.error('[JournalStory] image upload error:', uploadErr);
        return null;
    }

    const { data: urlData } = supabase.storage
        .from('idea-images')
        .getPublicUrl(storagePath);

    const imageUrl = urlData?.publicUrl || '';

    const { data, error } = await supabase
        .from('journal_entries')
        .insert({
            user_id: userId,
            project_id: projectId,
            entry_type: 'image',
            content: imageUrl,
            entry_date: today,
        })
        .select()
        .single();

    if (error) {
        console.error('[JournalStory] saveImageEntry error:', error);
        return null;
    }
    return data;
}

/** Save a transcription as a text entry (from journal video recording) */
export async function saveTranscriptionEntry(
    userId: string,
    projectId: string | null,
    transcription: string
): Promise<JournalEntry | null> {
    if (!transcription.trim()) return null;
    return saveTextEntry(userId, projectId, transcription);
}

/**
 * Sync daily video entry for a specific date so chat feed has a video sequence card.
 */
export async function syncDailyVideoEntry(
    userId: string,
    projectId: string | null,
    date: string
): Promise<JournalEntry | null> {
    // 1. Fetch all clips for this date
    const clips = await fetchClipsByDate(userId, date);
    if (clips.length === 0) {
        // If no clips left, remove any video entry for this date
        await supabase
            .from('journal_entries')
            .delete()
            .eq('user_id', userId)
            .eq('entry_date', date)
            .eq('entry_type', 'video');
        return null;
    }

    const clipUrls = clips.map(c => c.clip_url);
    const transcriptions = clips
        .map(c => c.transcription)
        .filter(Boolean)
        .join(' ');

    // 2. Check if a video entry already exists for this date
    const { data: existing } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .eq('entry_type', 'video')
        .maybeSingle();

    if (existing) {
        const { data: updated, error } = await supabase
            .from('journal_entries')
            .update({
                video_url: JSON.stringify(clipUrls),
                transcription: transcriptions || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) console.error('[JournalStory] syncDailyVideoEntry update error:', error);
        return updated || existing;
    } else {
        const { data: created, error } = await supabase
            .from('journal_entries')
            .insert({
                user_id: userId,
                project_id: projectId,
                entry_type: 'video',
                video_url: JSON.stringify(clipUrls),
                transcription: transcriptions || null,
                entry_date: date,
            })
            .select()
            .single();

        if (error) console.error('[JournalStory] syncDailyVideoEntry insert error:', error);
        return created || null;
    }
}



// ── Search ─────────────────────────────────────────────────────────────────

/** Search entries by text content or transcription */
export async function searchEntries(
    userId: string,
    query: string
): Promise<JournalEntry[]> {
    const searchTerm = `%${query}%`;

    const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .or(`content.ilike.${searchTerm},transcription.ilike.${searchTerm}`)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('[JournalStory] searchEntries error:', error);
        return [];
    }
    return data || [];
}

// ── Delete ─────────────────────────────────────────────────────────────────

/** Update content of a journal entry (inline text edit) */
export async function updateEntryContent(entryId: string, content: string): Promise<boolean> {
    const { error } = await supabase
        .from('journal_entries')
        .update({ content, transcription: content, updated_at: new Date().toISOString() })
        .eq('id', entryId);

    if (error) {
        console.error('[JournalStory] updateEntryContent error:', error);
        return false;
    }
    return true;
}

/** Delete a journal entry */
export async function deleteEntry(entryId: string): Promise<boolean> {
    const { error } = await supabase
        .from('journal_entries')
        .delete()
        .eq('id', entryId);

    if (error) {
        console.error('[JournalStory] deleteEntry error:', error);
        return false;
    }
    return true;
}

/** Delete a journal clip */
export async function deleteClip(clipId: string): Promise<boolean> {
    const { error } = await supabase
        .from('journal_clips')
        .delete()
        .eq('id', clipId);

    if (error) {
        console.error('[JournalStory] deleteClip error:', error);
        return false;
    }
    return true;
}

// ── Publication & TikTok Feed Helpers ─────────────────────────────────────

/** Fetch all distinct dates that have video entries or clips for this user */
export async function fetchAvailableVideoDates(userId: string): Promise<string[]> {
    const [clipsRes, entriesRes] = await Promise.all([
        supabase
            .from('journal_clips')
            .select('clip_date')
            .eq('user_id', userId)
            .order('clip_date', { ascending: false }),
        supabase
            .from('journal_entries')
            .select('entry_date')
            .eq('user_id', userId)
            .eq('entry_type', 'video')
            .order('entry_date', { ascending: false })
    ]);

    const dates = new Set<string>();
    if (clipsRes.data) {
        clipsRes.data.forEach((r: any) => { if (r.clip_date) dates.add(r.clip_date); });
    }
    if (entriesRes.data) {
        entriesRes.data.forEach((r: any) => { if (r.entry_date) dates.add(r.entry_date); });
    }

    // Sort chronologically ascending: oldest first (top of calendar) to newest at end (bottom of calendar)
    return Array.from(dates).sort((a, b) => a.localeCompare(b));
}

/** Check if a specific date's compilation is published */
export async function checkIsDailyStoryPublished(userId: string, date: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('journal_entries')
        .select('is_public, published_idea_id')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .eq('entry_type', 'video')
        .maybeSingle();

    if (error || !data) return false;
    return !!data.is_public;
}

/** Get the published idea slug for a specific date if published */
export async function getDailyStoryPublishedSlug(userId: string, date: string): Promise<string | null> {
    const { data: entry } = await supabase
        .from('journal_entries')
        .select('published_idea_id')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .eq('entry_type', 'video')
        .maybeSingle();

    if (!entry?.published_idea_id) return null;

    const { data: idea } = await supabase
        .from('ideas')
        .select('slug')
        .eq('id', entry.published_idea_id)
        .maybeSingle();

    return idea?.slug || null;
}

/**
 * Ensure an unlisted daily story idea exists so a unique share link is immediately available
 * for anyone with the link, without publicly publishing it to the Home Page yet.
 */
export async function ensureDailyStoryIdea(
    userId: string,
    projectId: string | null,
    date: string,
    clips: JournalClip[],
    username?: string
): Promise<{ success: boolean; ideaId: string; slug: string }> {
    if (!clips || clips.length === 0) return { success: false, ideaId: '', slug: '' };

    const safeDate = typeof date === 'string' && date ? date : getLocalDateISO();
    const d = new Date(safeDate + 'T00:00:00');
    const dateFormatted = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) : safeDate;
    const cleanUsername = typeof username === 'string' ? username : '';
    const title = cleanUsername ? `${cleanUsername}'s Daily Story • ${dateFormatted} (${clips.length} Takes)` : `Daily Story • ${dateFormatted} (${clips.length} Takes)`;
    const transcription = clips.map(c => c.transcription).filter(Boolean).join(' ') || `Daily video journal story compilation with ${clips.length} takes.`;

    let { data: existingEntry } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .eq('entry_type', 'video')
        .maybeSingle();

    if (!existingEntry) {
        existingEntry = await syncDailyVideoEntry(userId, projectId, date);
    }

    const targetSlug = generateUniqueStorySlug(username, userId, date);

    // Ensure thumbnail is available from first clip or dynamically generated frame
    let coverThumb: string | null = clips[0]?.thumbnail_url || null;
    if (!coverThumb && clips[0]?.clip_url) {
        coverThumb = await captureAndUploadVideoThumbnail(userId, clips[0].clip_url, 'daily_cover');
        if (coverThumb && clips[0]) {
            clips[0].thumbnail_url = coverThumb;
        }
    }

    if (existingEntry?.published_idea_id) {
        const { data: existingIdea } = await supabase
            .from('ideas')
            .select('id, slug, is_public, visibility')
            .eq('id', existingEntry.published_idea_id)
            .maybeSingle();

        if (existingIdea) {
            // Upgrade legacy or generic slugs like 'journal-YYYY-MM-DD' to unique author-bound slug
            const currentSlug = existingIdea.slug || targetSlug;
            const finalSlug = (currentSlug.startsWith('journal-') && !currentSlug.includes('-story-'))
                ? targetSlug
                : currentSlug;

            // Maintain privacy: generating/refreshing link access MUST NOT auto-publish to Home Page
            const isPublic = existingIdea.visibility === 'public' && existingIdea.is_public === true;
            const visibilityVal = isPublic ? 'public' : (existingIdea.visibility === 'network' ? 'network' : 'private');

            // Update clips provenance and ensure link access
            await supabase
                .from('ideas')
                .update({
                    slug: finalSlug,
                    description: transcription,
                    thumbnail_url: coverThumb,
                    image_url: coverThumb,
                    is_public: isPublic,
                    visibility: visibilityVal,
                    provenance_log: {
                        clips,
                        date,
                        takes_count: clips.length,
                        published_via: 'journal_share',
                        is_stopped: false
                    },
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingIdea.id);

            return { success: true, ideaId: existingIdea.id, slug: finalSlug };
        }
    }

    // Create new unlisted idea record for link sharing with author-bound unique slug
    // Matching exact schema of public.ideas table (no allow_link_access or category columns)
    const ideaPayload: any = {
        title,
        description: transcription,
        media_type: 'video',
        media_url: clips[0]?.clip_url || '',
        thumbnail_url: coverThumb,
        image_url: coverThumb,
        is_public: false, // Unlisted/Private by default so link works without publishing to Home Page
        visibility: 'private', // Link access only
        user_id: userId,
        project_id: projectId || null,
        level: 1,
        slug: targetSlug,
        provenance_log: {
            clips,
            date,
            takes_count: clips.length,
            published_via: 'journal_share'
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const { data: newIdea, error: insErr } = await supabase
        .from('ideas')
        .insert(ideaPayload)
        .select('id, slug')
        .single();

    if (insErr) {
        console.error('[JournalStory] ensureDailyStoryIdea insert idea error:', insErr);
        return { success: false, ideaId: '', slug: '' };
    }

    if (existingEntry) {
        await supabase
            .from('journal_entries')
            .update({
                published_idea_id: newIdea.id,
                thumbnail_url: coverThumb
            })
            .eq('id', existingEntry.id);
    }

    return { success: true, ideaId: newIdea.id, slug: newIdea.slug || targetSlug };
}

/** Reorder clips for a day and persist new clip_order to database */
export async function reorderDailyClips(
    userId: string,
    date: string,
    reorderedClips: JournalClip[]
): Promise<boolean> {
    if (!reorderedClips || reorderedClips.length === 0) return true;

    try {
        const updatePromises = reorderedClips.map((clip, idx) => 
            supabase
                .from('journal_clips')
                .update({ clip_order: idx + 1 })
                .eq('id', clip.id)
                .eq('user_id', userId)
        );
        await Promise.all(updatePromises);

        // Also update entry video_urls
        const clipUrls = reorderedClips.map(c => c.clip_url);
        await supabase
            .from('journal_entries')
            .update({
                video_url: JSON.stringify(clipUrls),
                updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('entry_date', date)
            .eq('entry_type', 'video');

        // If story idea exists, update provenance_log.clips
        const { data: entry } = await supabase
            .from('journal_entries')
            .select('published_idea_id')
            .eq('user_id', userId)
            .eq('entry_date', date)
            .eq('entry_type', 'video')
            .maybeSingle();

        if (entry?.published_idea_id) {
            await supabase
                .from('ideas')
                .update({
                    video_url: clipUrls[0] || '',
                    provenance_log: {
                        clips: reorderedClips,
                        date,
                        takes_count: reorderedClips.length,
                        updated_at: new Date().toISOString()
                    }
                })
                .eq('id', entry.published_idea_id);
        }

        return true;
    } catch (err) {
        console.error('[JournalStory] reorderDailyClips error:', err);
        return false;
    }
}

/** Helper key for persistent custom sequence reordering per user and date */
export function getDayCustomOrderKey(userId: string, date: string): string {
    return `yolofuck_day_order_${userId}_${date}`;
}

export function getDayCustomOrder(userId: string, date: string): string[] | null {
    if (!userId || !date) return null;
    try {
        const raw = localStorage.getItem(getDayCustomOrderKey(userId, date));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function setDayCustomOrder(userId: string, date: string, clipIds: string[]): void {
    if (!userId || !date) return;
    try {
        localStorage.setItem(getDayCustomOrderKey(userId, date), JSON.stringify(clipIds));
    } catch {}
}

export function resetDayCustomOrder(userId: string, date: string): void {
    if (!userId || !date) return;
    try {
        localStorage.removeItem(getDayCustomOrderKey(userId, date));
    } catch {}
}

/**
 * One-time / safety claim function:
 * Ensures all existing clips and journal entries (local device and cloud DB)
 * are assigned to targetUserId (e.g. minimalmassive@gmail.com / Plasticin).
 */
export async function claimAllExistingClipsForUser(targetUserId: string): Promise<void> {
    if (!targetUserId) return;
    try {
        localStorage.setItem('yolofuck_local_owner_id', targetUserId);
        localStorage.setItem('ideanite_local_owner_id', targetUserId);

        // Update any unassigned, generic, or legacy clips in Supabase
        await supabase
            .from('journal_clips')
            .update({ user_id: targetUserId })
            .or(`user_id.is.null,user_id.eq.local_user,user_id.eq.anonymous,user_id.neq.${targetUserId}`);

        await supabase
            .from('journal_entries')
            .update({ user_id: targetUserId })
            .or(`user_id.is.null,user_id.eq.local_user,user_id.eq.anonymous,user_id.neq.${targetUserId}`);
    } catch (e) {
        console.warn('[JournalStory] claimAllExistingClipsForUser notice:', e);
    }
}

/** Publish a day's compilation as a full-fledged published short on Home Page */
export async function publishDailyStory(
    userId: string,
    projectId: string | null,
    date: string,
    clips: JournalClip[],
    username?: string
): Promise<{ success: boolean; ideaId?: string; slug?: string }> {
    if (!clips || clips.length === 0) return { success: false };

    const safeDate = typeof date === 'string' && date ? date : getLocalDateISO();
    const d = new Date(safeDate + 'T00:00:00');
    const dateFormatted = !isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) : safeDate;
    const cleanUsername = typeof username === 'string' ? username : '';
    const title = cleanUsername ? `${cleanUsername}'s Daily Story • ${dateFormatted} (${clips.length} Takes)` : `Daily Story • ${dateFormatted} (${clips.length} Takes)`;
    const transcription = clips.map(c => c.transcription).filter(Boolean).join(' ') || `Daily video journal story compilation with ${clips.length} takes.`;

    // 1. Check if journal entry already exists
    let { data: existingEntry } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .eq('entry_type', 'video')
        .maybeSingle();

    if (!existingEntry) {
        existingEntry = await syncDailyVideoEntry(userId, projectId, date);
    }

    let publishedIdeaId = existingEntry?.published_idea_id;
    let publishedSlug = '';

    // Check if idea already exists to preserve existing visibility if set
    let currentVisibility: 'private' | 'network' | 'public' | 'stopped' = 'private';
    let currentIsPublic = false;
    if (publishedIdeaId) {
        const { data: existingIdea } = await supabase
            .from('ideas')
            .select('visibility, is_public')
            .eq('id', publishedIdeaId)
            .maybeSingle();
        if (existingIdea) {
            currentVisibility = (existingIdea.visibility as any) || 'private';
            currentIsPublic = Boolean(existingIdea.is_public);
        }
    }

    // Ensure thumbnail is available from first clip or dynamically generated frame
    let coverThumb: string | null = clips[0]?.thumbnail_url || null;
    if (!coverThumb && clips[0]?.clip_url) {
        coverThumb = await captureAndUploadVideoThumbnail(userId, clips[0].clip_url, 'daily_cover');
        if (coverThumb && clips[0]) {
            clips[0].thumbnail_url = coverThumb;
        }
    }

    // Build payload matching exact columns in public.ideas table
    const ideaPayload: any = {
        title,
        description: transcription,
        media_type: 'video',
        media_url: clips[0]?.clip_url || '',
        thumbnail_url: coverThumb,
        image_url: coverThumb,
        is_public: currentIsPublic,
        visibility: currentVisibility === 'stopped' ? 'private' : currentVisibility,
        user_id: userId,
        project_id: projectId || null,
        level: 1,
        provenance_log: {
            clips,
            date,
            takes_count: clips.length,
            published_via: 'journal_share_modal',
            is_stopped: false
        },
        updated_at: new Date().toISOString()
    };

    if (publishedIdeaId) {
        // Update existing idea
        const { data: updatedIdea, error: updErr } = await supabase
            .from('ideas')
            .update(ideaPayload)
            .eq('id', publishedIdeaId)
            .select('id, slug')
            .single();

        if (updErr) {
            console.error('[JournalStory] publishDailyStory update idea error:', updErr);
            return { success: false };
        }
        publishedSlug = updatedIdea?.slug || '';
    } else {
        // Create new idea with author-bound unique slug
        const slug = generateUniqueStorySlug(username, userId, date);
        ideaPayload.slug = slug;
        ideaPayload.created_at = new Date().toISOString();

        const { data: newIdea, error: insErr } = await supabase
            .from('ideas')
            .insert(ideaPayload)
            .select('id, slug')
            .single();

        if (insErr) {
            console.error('[JournalStory] publishDailyStory insert idea error:', insErr);
            return { success: false };
        }
        publishedIdeaId = newIdea.id;
        publishedSlug = newIdea.slug || slug;
    }

    // 2. Mark journal_entries with idea id without forcing public on homepage
    if (existingEntry) {
        await supabase
            .from('journal_entries')
            .update({
                is_public: currentIsPublic,
                published_at: currentIsPublic ? (existingEntry.published_at || new Date().toISOString()) : null,
                published_idea_id: publishedIdeaId
            })
            .eq('id', existingEntry.id);
    }

    return { success: true, ideaId: publishedIdeaId, slug: publishedSlug };
}

/** Unpublish a daily compilation from public homepage */
export async function unpublishDailyStory(userId: string, date: string): Promise<boolean> {
    const { data: existingEntry } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .eq('entry_type', 'video')
        .maybeSingle();

    if (!existingEntry) return false;

    if (existingEntry.published_idea_id) {
        await supabase
            .from('ideas')
            .update({ is_public: false, visibility: 'private', allow_link_access: true })
            .eq('id', existingEntry.published_idea_id);
    }

    await supabase
        .from('journal_entries')
        .update({
            is_public: false,
            published_at: null
        })
        .eq('id', existingEntry.id);

    return true;
}

/** Update visibility for a daily story (private, network, public) */
export async function updateDailyStoryVisibility(
    userId: string, 
    date: string, 
    visibility: 'private' | 'network' | 'public'
): Promise<{ success: boolean; ideaId?: string }> {
    const { data: existingEntry } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('entry_date', date)
        .eq('entry_type', 'video')
        .maybeSingle();

    if (!existingEntry || !existingEntry.published_idea_id) {
        return { success: false };
    }

    const isPublic = visibility === 'public';
    const { error: ideaErr } = await supabase
        .from('ideas')
        .update({
            visibility,
            is_public: isPublic,
            updated_at: new Date().toISOString()
        })
        .eq('id', existingEntry.published_idea_id);

    if (ideaErr) {
        console.error('[JournalStory] updateDailyStoryVisibility idea error:', ideaErr);
        return { success: false };
    }

    await supabase
        .from('journal_entries')
        .update({
            is_public: isPublic || visibility === 'network',
            published_at: new Date().toISOString()
        })
        .eq('id', existingEntry.id);

    return { success: true, ideaId: existingEntry.published_idea_id };
}

/** Stop sharing daily story - immediately disables link and stops video playback */
export async function stopDailyStorySharing(userId: string, date: string, ideaId?: string): Promise<boolean> {
    let targetIdeaId = ideaId;

    if (!targetIdeaId) {
        const { data: existingEntry } = await supabase
            .from('journal_entries')
            .select('published_idea_id')
            .eq('user_id', userId)
            .eq('entry_date', date)
            .eq('entry_type', 'video')
            .maybeSingle();

        targetIdeaId = existingEntry?.published_idea_id;
    }

    if (!targetIdeaId) return false;

    // Fetch current provenance to preserve it with is_stopped flag
    const { data: idea } = await supabase
        .from('ideas')
        .select('provenance_log')
        .eq('id', targetIdeaId)
        .maybeSingle();

    const prov = (idea?.provenance_log && typeof idea.provenance_log === 'object' && !Array.isArray(idea.provenance_log))
        ? idea.provenance_log
        : {};

    const { error } = await supabase
        .from('ideas')
        .update({
            visibility: 'stopped',
            is_public: false,
            provenance_log: {
                ...prov,
                is_stopped: true,
                stopped_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
        })
        .eq('id', targetIdeaId);

    if (error) {
        console.error('[JournalStory] stopDailyStorySharing error:', error);
        return false;
    }

    // Detach from journal_entries both by idea id and by user/date to prevent any home page leakage
    await supabase
        .from('journal_entries')
        .update({ is_public: false, published_at: null })
        .eq('published_idea_id', targetIdeaId);

    if (userId && date) {
        await supabase
            .from('journal_entries')
            .update({ is_public: false, published_at: null })
            .eq('user_id', userId)
            .eq('entry_date', date);
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('journal_story_unshared', { detail: { ideaId: targetIdeaId, date } }));
    }

    return true;
}

/** Resume sharing a stopped daily story */
export async function resumeDailyStorySharing(
    userId: string, 
    date: string, 
    ideaId: string, 
    restoreVisibility: 'private' | 'network' | 'public' = 'private'
): Promise<boolean> {
    const { data: idea } = await supabase
        .from('ideas')
        .select('provenance_log')
        .eq('id', ideaId)
        .maybeSingle();

    const prov = (idea?.provenance_log && typeof idea.provenance_log === 'object' && !Array.isArray(idea.provenance_log))
        ? idea.provenance_log
        : {};

    const isPublic = restoreVisibility === 'public';
    const { error } = await supabase
        .from('ideas')
        .update({
            visibility: restoreVisibility,
            is_public: isPublic,
            provenance_log: {
                ...prov,
                is_stopped: false,
                resumed_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
        })
        .eq('id', ideaId);

    if (error) {
        console.error('[JournalStory] resumeDailyStorySharing error:', error);
        return false;
    }

    await supabase
        .from('journal_entries')
        .update({ is_public: isPublic || restoreVisibility === 'network' })
        .eq('user_id', userId)
        .eq('entry_date', date);

    return true;
}

/** Permanently delete daily story share */
export async function deleteDailyStoryShare(userId: string, date: string, ideaId?: string): Promise<boolean> {
    let targetIdeaId = ideaId;

    if (!targetIdeaId) {
        const { data: existingEntry } = await supabase
            .from('journal_entries')
            .select('published_idea_id')
            .eq('user_id', userId)
            .eq('entry_date', date)
            .eq('entry_type', 'video')
            .maybeSingle();

        targetIdeaId = existingEntry?.published_idea_id;
    }

    if (!targetIdeaId) return false;

    // 1. Detach from journal_entries and clear compiled video
    await supabase
        .from('journal_entries')
        .update({
            published_idea_id: null,
            is_public: false,
            published_at: null,
            video_url: null
        })
        .eq('user_id', userId)
        .eq('entry_date', date);

    await supabase
        .from('journal_entries')
        .update({
            published_idea_id: null,
            is_public: false,
            published_at: null,
            video_url: null
        })
        .eq('published_idea_id', targetIdeaId);

    // 2. Delete idea from ideas table
    const { error } = await supabase
        .from('ideas')
        .delete()
        .eq('id', targetIdeaId);

    if (error) {
        console.error('[JournalStory] deleteDailyStoryShare error:', error);
        return false;
    }

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('journal_story_unshared', { detail: { ideaId: targetIdeaId, date } }));
    }

    return true;
}

/** Fetch all shared daily stories for the user */
export async function fetchUserSharedDailyStories(userId: string): Promise<any[]> {
    if (!userId) return [];
    try {
        // Query ideas for this user (ideas table in DB has no 'category' column)
        const { data, error } = await supabase
            .from('ideas')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
            // Filter to journal stories (identified by provenance_log or media_type)
            const journalStories = data.filter((item: any) => {
                if (item.provenance_log?.clips || item.provenance_log?.published_via) return true;
                if (item.slug && item.slug.includes('-story-')) return true;
                if (item.media_type === 'video') return true;
                return true;
            });
            if (journalStories.length > 0) {
                return journalStories;
            }
        }

        // Fallback: check journal_entries table for published stories
        const { data: entries } = await supabase
            .from('journal_entries')
            .select('*, idea:ideas(*)')
            .eq('user_id', userId)
            .not('published_idea_id', 'is', null)
            .order('created_at', { ascending: false });

        if (entries && entries.length > 0) {
            const mapped = entries
                .map((e: any) => e.idea || e)
                .filter(Boolean);
            return mapped;
        }

        return data || [];
    } catch (err) {
        console.error('[JournalStory] fetchUserSharedDailyStories exception:', err);
        return [];
    }
}

