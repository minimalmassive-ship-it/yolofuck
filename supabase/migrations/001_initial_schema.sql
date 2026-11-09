-- ============================================================================
-- yolofuck Database Schema — Supabase Initial Migration
-- Tables: profiles, projects, journal_entries, journal_clips, ideas
-- Storage: recordings, idea-images, idea-videos
-- ============================================================================

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
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

CREATE POLICY "Public profiles are viewable by everyone" 
    ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" 
    ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Auto create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        new.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#a78bfa',
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT false,
    is_system BOOLEAN NOT NULL DEFAULT false,
    system_type TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own or public projects" 
    ON public.projects FOR SELECT 
    USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can create own projects" 
    ON public.projects FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" 
    ON public.projects FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" 
    ON public.projects FOR DELETE 
    USING (auth.uid() = user_id);


-- 3. JOURNAL ENTRIES TABLE (Compiled Daily Story)
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    entry_type TEXT NOT NULL DEFAULT 'video' CHECK (entry_type IN ('text', 'image', 'video')),
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

CREATE POLICY "Public entries viewable by all, private only by owner" 
    ON public.journal_entries FOR SELECT 
    USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert own journal entries" 
    ON public.journal_entries FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own journal entries" 
    ON public.journal_entries FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own journal entries" 
    ON public.journal_entries FOR DELETE 
    USING (auth.uid() = user_id);


-- 4. JOURNAL CLIPS TABLE (Individual Video Clips Taken Throughout The Day)
CREATE TABLE IF NOT EXISTS public.journal_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

CREATE POLICY "Users can view own journal clips" 
    ON public.journal_clips FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clips" 
    ON public.journal_clips FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clips" 
    ON public.journal_clips FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own clips" 
    ON public.journal_clips FOR DELETE 
    USING (auth.uid() = user_id);


-- 5. IDEAS TABLE (Shared/Published Story cards)
CREATE TABLE IF NOT EXISTS public.ideas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

CREATE POLICY "Public ideas viewable by all, private only by owner" 
    ON public.ideas FOR SELECT 
    USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert own ideas" 
    ON public.ideas FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ideas" 
    ON public.ideas FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ideas" 
    ON public.ideas FOR DELETE 
    USING (auth.uid() = user_id);


-- 6. STORAGE BUCKETS SETUP
-- Insert storage buckets if not present
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('recordings', 'recordings', true),
    ('idea-images', 'idea-images', true),
    ('idea-videos', 'idea-videos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies
CREATE POLICY "Public Access for recordings"
    ON storage.objects FOR SELECT
    USING (bucket_id IN ('recordings', 'idea-images', 'idea-videos'));

CREATE POLICY "Authenticated users can upload recordings"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id IN ('recordings', 'idea-images', 'idea-videos') 
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Users can update own recordings"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id IN ('recordings', 'idea-images', 'idea-videos') 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete own recordings"
    ON storage.objects FOR DELETE
    USING (
        bucket_id IN ('recordings', 'idea-images', 'idea-videos') 
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
