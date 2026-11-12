-- ══════════════════════════════════════════════════════════════════════
-- Memcut / Yolofuck: Czysta Standalone Architektura Bazy Danych
-- Project ID: ngzffnpyrqpjxuxkjvnl
--
-- 1. Tworzy nową, czystą tabelę shared_stories (zastępującą tabelę ideas)
-- 2. Migruje dotychczasowe linki udostępnień ze starej tabeli ideas
-- 3. Nakłada rygorystyczny RLS na shared_stories
-- 4. Usuwa martwą tabelę projects i jej klucze obce
-- ══════════════════════════════════════════════════════════════════════

-- 1. Utworzenie czystej tabeli shared_stories dla udostępnień wideo-relacji
CREATE TABLE IF NOT EXISTS public.shared_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    transcription TEXT,
    thumbnail_url TEXT,
    media_url TEXT,
    clips JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_public BOOLEAN NOT NULL DEFAULT false,
    visibility TEXT NOT NULL DEFAULT 'unlisted', -- 'public', 'unlisted', 'stopped'
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indeksy dla natychmiastowej szybkości
CREATE INDEX IF NOT EXISTS idx_shared_stories_user_id ON public.shared_stories(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_stories_slug ON public.shared_stories(slug);
CREATE INDEX IF NOT EXISTS idx_shared_stories_user_date ON public.shared_stories(user_id, date);

-- Zabezpieczenie RLS (właściciel zarządza swoimi, gość widzi tylko to co publiczne/unlisted)
ALTER TABLE public.shared_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_stories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own shared stories" ON public.shared_stories;
CREATE POLICY "Users can manage own shared stories"
  ON public.shared_stories FOR ALL
  TO authenticated
  USING ((auth.uid())::text = user_id)
  WITH CHECK ((auth.uid())::text = user_id);

DROP POLICY IF EXISTS "Public can view shared stories" ON public.shared_stories;
CREATE POLICY "Public can view shared stories"
  ON public.shared_stories FOR SELECT
  TO anon, authenticated
  USING (
    ((auth.uid())::text = user_id) 
    OR (is_public = true AND visibility IN ('public', 'unlisted'))
  );

-- 2. Bezpieczna migracja istniejących udostępnień ze starej tabeli ideas
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ideas') THEN
        INSERT INTO public.shared_stories (id, user_id, date, slug, title, description, thumbnail_url, media_url, is_public, visibility, created_at, updated_at)
        SELECT 
            id,
            user_id,
            COALESCE(SUBSTRING(slug FROM '[0-9]{4}-[0-9]{2}-[0-9]{2}'), TO_CHAR(created_at, 'YYYY-MM-DD')),
            slug,
            title,
            description,
            thumbnail_url,
            media_url,
            COALESCE(is_public, false),
            COALESCE(visibility, 'unlisted'),
            created_at,
            updated_at
        FROM public.ideas
        WHERE slug IS NOT NULL
        ON CONFLICT (slug) DO NOTHING;
    END IF;
END $$;

-- 3. Usunięcie martwej tabeli projects i powiązanych więzów integralności
ALTER TABLE public.journal_clips DROP CONSTRAINT IF EXISTS journal_clips_project_id_fkey;
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_project_id_fkey;
DROP TABLE IF EXISTS public.projects CASCADE;

-- 4. Raport końcowy tabel publicznych
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
