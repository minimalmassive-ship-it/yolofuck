-- ══════════════════════════════════════════════════════════════════════
-- Yolofuck Dedicated Supabase RLS Hardening (Strict Single-Tenant Isolation)
-- Project ID: ngzffnpyrqpjxuxkjvnl
-- Fixes: ERROR 42883 (uuid = text operator mismatch via (auth.uid())::text)
-- Purges: Drops all legacy open USING (true) policies automatically
-- ══════════════════════════════════════════════════════════════════════

-- Krok 0: Automatyczne usunięcie wszelkich starych reguł na tabelach Yolofuck
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('journal_clips', 'journal_entries', 'ideas', 'profiles', 'projects')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- 1. TABELA: journal_clips (Kluczowy magazyn nagrań wideo użytkownika)
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.journal_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_clips FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clips"
  ON public.journal_clips FOR SELECT
  TO authenticated
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert own clips"
  ON public.journal_clips FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update own clips"
  ON public.journal_clips FOR UPDATE
  TO authenticated
  USING ((auth.uid())::text = user_id)
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete own clips"
  ON public.journal_clips FOR DELETE
  TO authenticated
  USING ((auth.uid())::text = user_id);


-- ══════════════════════════════════════════════════════════════════════
-- 2. TABELA: journal_entries (Wpisy dzienne dziennika wideo)
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entries"
  ON public.journal_entries FOR SELECT
  TO authenticated
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert own entries"
  ON public.journal_entries FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update own entries"
  ON public.journal_entries FOR UPDATE
  TO authenticated
  USING ((auth.uid())::text = user_id)
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete own entries"
  ON public.journal_entries FOR DELETE
  TO authenticated
  USING ((auth.uid())::text = user_id);


-- ══════════════════════════════════════════════════════════════════════
-- 3. TABELA: ideas (W Yolofuck służy do udostępniania linków /story/:slug)
-- Właściciel zarządza swoimi, a ktokolwiek z zewnątrz widzi TYLKO udostępnione
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ideas"
  ON public.ideas FOR SELECT
  TO authenticated
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Public can view shared ideas"
  ON public.ideas FOR SELECT
  TO anon, authenticated
  USING (is_public = true OR visibility IN ('public', 'unlisted'));

CREATE POLICY "Users can insert own ideas"
  ON public.ideas FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update own ideas"
  ON public.ideas FOR UPDATE
  TO authenticated
  USING ((auth.uid())::text = user_id)
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete own ideas"
  ON public.ideas FOR DELETE
  TO authenticated
  USING ((auth.uid())::text = user_id);


-- ══════════════════════════════════════════════════════════════════════
-- 4. TABELA: profiles (Ustawienia nagrywania, transkrypcji i nazwa usera)
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING ((auth.uid())::text = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid())::text = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((auth.uid())::text = id)
  WITH CHECK ((auth.uid())::text = id);


-- ══════════════════════════════════════════════════════════════════════
-- 5. TABELA: projects (W Yolofuck to tylko techniczny kontener 'Journal')
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING ((auth.uid())::text = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING ((auth.uid())::text = user_id)
  WITH CHECK ((auth.uid())::text = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING ((auth.uid())::text = user_id);


-- ══════════════════════════════════════════════════════════════════════
-- 6. Indeksy dla natychmiastowej wydajności filtrów RLS
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_journal_clips_user_id ON public.journal_clips(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON public.journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON public.ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);


-- ══════════════════════════════════════════════════════════════════════
-- 7. Raport: potwierdzenie aktywnego RLS na tabelach
-- ══════════════════════════════════════════════════════════════════════
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public' 
  AND tablename IN ('journal_clips', 'journal_entries', 'ideas', 'profiles', 'projects')
ORDER BY tablename;
