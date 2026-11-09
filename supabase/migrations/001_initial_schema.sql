-- ============================================================================
-- yolofuck Database Schema — Supabase Initial Migration
-- Tables: profiles, projects, journal_entries, journal_clips, ideas
-- Storage: recordings, idea-images, idea-videos
-- Designed for friction-free 9:16 video shorts journaling (supports device users & anon)
-- ============================================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    website TEXT,
    location TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" 
    ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert profile" ON public.profiles;
CREATE POLICY "Anyone can insert profile" 
    ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update profile" ON public.profiles;
CREATE POLICY "Anyone can update profile" 
    ON public.profiles FOR UPDATE USING (true);


-- 2. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#10b981',
    is_public BOOLEAN NOT NULL DEFAULT false,
    is_system BOOLEAN NOT NULL DEFAULT false,
    system_type TEXT,
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Projects viewable by owner or public" ON public.projects;
CREATE POLICY "Projects viewable by owner or public" 
    ON public.projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert projects" ON public.projects;
CREATE POLICY "Users can insert projects" 
    ON public.projects FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update projects" ON public.projects;
CREATE POLICY "Users can update projects" 
    ON public.projects FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete projects" ON public.projects;
CREATE POLICY "Users can delete projects" 
    ON public.projects FOR DELETE USING (true);


-- 3. JOURNAL ENTRIES TABLE (Daily Journal Records)
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL DEFAULT 'video',
    content TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    transcription TEXT,
    entry_date TEXT NOT NULL, -- Format: YYYY-MM-DD
    is_public BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ,
    published_idea_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date 
    ON public.journal_entries (user_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_entries_public 
    ON public.journal_entries (is_public, entry_date);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Journal entries select policy" ON public.journal_entries;
CREATE POLICY "Journal entries select policy" 
    ON public.journal_entries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Journal entries insert policy" ON public.journal_entries;
CREATE POLICY "Journal entries insert policy" 
    ON public.journal_entries FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Journal entries update policy" ON public.journal_entries;
CREATE POLICY "Journal entries update policy" 
    ON public.journal_entries FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Journal entries delete policy" ON public.journal_entries;
CREATE POLICY "Journal entries delete policy" 
    ON public.journal_entries FOR DELETE USING (true);


-- 4. JOURNAL CLIPS TABLE (Individual 9:16 Video Shorts Clips)
CREATE TABLE IF NOT EXISTS public.journal_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    clip_url TEXT NOT NULL,
    thumbnail_url TEXT,
    transcription TEXT,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    clip_order INTEGER NOT NULL DEFAULT 0,
    clip_date TEXT NOT NULL, -- Format: YYYY-MM-DD
    is_merged BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_journal_clips_user_date 
    ON public.journal_clips (user_id, clip_date, clip_order);

ALTER TABLE public.journal_clips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Journal clips select policy" ON public.journal_clips;
CREATE POLICY "Journal clips select policy" 
    ON public.journal_clips FOR SELECT USING (true);

DROP POLICY IF EXISTS "Journal clips insert policy" ON public.journal_clips;
CREATE POLICY "Journal clips insert policy" 
    ON public.journal_clips FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Journal clips update policy" ON public.journal_clips;
CREATE POLICY "Journal clips update policy" 
    ON public.journal_clips FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Journal clips delete policy" ON public.journal_clips;
CREATE POLICY "Journal clips delete policy" 
    ON public.journal_clips FOR DELETE USING (true);


-- 5. IDEAS TABLE (Shared/Published Story cards)
CREATE TABLE IF NOT EXISTS public.ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    folder_id UUID,
    title TEXT,
    description TEXT,
    slug TEXT UNIQUE,
    media_type TEXT NOT NULL DEFAULT 'video',
    media_url TEXT,
    image_url TEXT,
    thumbnail_url TEXT,
    is_public BOOLEAN NOT NULL DEFAULT false,
    visibility TEXT NOT NULL DEFAULT 'private',
    level INTEGER NOT NULL DEFAULT 1,
    is_tokenized BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON public.ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_public ON public.ideas(is_public);
CREATE INDEX IF NOT EXISTS idx_ideas_slug ON public.ideas(slug);

ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ideas select policy" ON public.ideas;
CREATE POLICY "Ideas select policy" 
    ON public.ideas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Ideas insert policy" ON public.ideas;
CREATE POLICY "Ideas insert policy" 
    ON public.ideas FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Ideas update policy" ON public.ideas;
CREATE POLICY "Ideas update policy" 
    ON public.ideas FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Ideas delete policy" ON public.ideas;
CREATE POLICY "Ideas delete policy" 
    ON public.ideas FOR DELETE USING (true);


-- 6. STORAGE BUCKETS SETUP
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('recordings', 'recordings', true),
    ('idea-images', 'idea-images', true),
    ('idea-videos', 'idea-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies (allowing public read and friction-free video uploads)
DROP POLICY IF EXISTS "Public Access for recordings" ON storage.objects;
CREATE POLICY "Public Access for recordings"
    ON storage.objects FOR SELECT
    USING (bucket_id IN ('recordings', 'idea-images', 'idea-videos'));

DROP POLICY IF EXISTS "Public upload for recordings" ON storage.objects;
CREATE POLICY "Public upload for recordings"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id IN ('recordings', 'idea-images', 'idea-videos'));

DROP POLICY IF EXISTS "Public update for recordings" ON storage.objects;
CREATE POLICY "Public update for recordings"
    ON storage.objects FOR UPDATE
    USING (bucket_id IN ('recordings', 'idea-images', 'idea-videos'));

DROP POLICY IF EXISTS "Public delete for recordings" ON storage.objects;
CREATE POLICY "Public delete for recordings"
    ON storage.objects FOR DELETE
    USING (bucket_id IN ('recordings', 'idea-images', 'idea-videos'));
