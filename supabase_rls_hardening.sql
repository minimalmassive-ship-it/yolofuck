-- ══════════════════════════════════════════════════════════════════════
-- Yolofuck & Plasticin Group: Supabase RLS Hardening Script
-- Project ID: ngzffnpyrqpjxuxkjvnl
-- Execution: Paste into Supabase Dashboard -> SQL Editor and click Run
-- ══════════════════════════════════════════════════════════════════════

-- 1. Tabela: journal_clips
ALTER TABLE public.journal_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_clips FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own clips" ON public.journal_clips;
DROP POLICY IF EXISTS "Users can insert own clips" ON public.journal_clips;
DROP POLICY IF EXISTS "Users can update own clips" ON public.journal_clips;
DROP POLICY IF EXISTS "Users can delete own clips" ON public.journal_clips;

CREATE POLICY "Users can view own clips"
  ON public.journal_clips FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own clips"
  ON public.journal_clips FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own clips"
  ON public.journal_clips FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own clips"
  ON public.journal_clips FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- 2. Tabela: journal_entries
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Users can insert own entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Users can update own entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Users can delete own entries" ON public.journal_entries;

CREATE POLICY "Users can view own entries"
  ON public.journal_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entries"
  ON public.journal_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries"
  ON public.journal_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own entries"
  ON public.journal_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- 3. Tabela: ideas (Publiczne udostępnienia i historie)
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ideas" ON public.ideas;
DROP POLICY IF EXISTS "Public can view shared ideas" ON public.ideas;
DROP POLICY IF EXISTS "Users can insert own ideas" ON public.ideas;
DROP POLICY IF EXISTS "Users can update own ideas" ON public.ideas;
DROP POLICY IF EXISTS "Users can delete own ideas" ON public.ideas;

CREATE POLICY "Users can view own ideas"
  ON public.ideas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Public can view shared ideas"
  ON public.ideas FOR SELECT
  TO anon, authenticated
  USING (is_public = true OR visibility IN ('public', 'unlisted'));

CREATE POLICY "Users can insert own ideas"
  ON public.ideas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ideas"
  ON public.ideas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ideas"
  ON public.ideas FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- 4. Tabela: profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);


-- 5. Tabela: projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY "Users can view own projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- 6. Indeksy dla maksymalnej wydajności RLS
CREATE INDEX IF NOT EXISTS idx_journal_clips_user_id ON public.journal_clips(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_id ON public.journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON public.ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);


-- 7. Weryfikacja statusu RLS na wszystkich tabelach publicznych
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
