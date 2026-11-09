# yolofuck — Daily Video Journal

A modern, frictionless video journal for daily short-form takes in 9:16 format with background voice transcription and spoken word search.

## Highlights

- **9:16 Video Shorts Grid**: Daily timeline where today is at the top, past days stacked below. Videos during each day are laid out horizontally in chronological sequence (oldest to newest, left to right).
- **Spoken Word Search**: Microphone is always active in the background transcribing voice to text. Videos are searchable by any word spoken in the take (e.g. "pizza", "meeting", "workout").
- **Full Screen 9:16 Viewfinder**: Immersive camera recorder with zero frame clutter, orange timestamp indicators, front/back camera switch, and live floating caption feedback.
- **Hold-To-Record (30s Max)**: Press and hold to capture takes, click the center red plus icon at any time to save and review in the daily journal story.
- **Neumorphic Dark UI**: Custom dark slate, gunmetal, and emerald green design system with zero purple hues.
- **Local & Cloud Sync**: IndexedDB offline fallback with Supabase storage and database synchronization.

## Tech Stack

- **Framework**: React 19, Vite, TypeScript
- **Styling**: Vanilla CSS (Neumorphic Dark Design System)
- **Backend**: Supabase (PostgreSQL, Storage Buckets: `recordings`, `idea-videos`, `idea-images`)
- **Speech Engine**: Web Speech API with Groq / Deepgram cloud fallback

## Setup & Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env`:
   ```bash
   cp .env.example .env
   # Fill in VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GROQ_API_KEY
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

## Database Migration

The full SQL schema is located in `supabase/migrations/001_initial_schema.sql`. Paste it directly into your Supabase SQL Editor to set up all tables and storage policies in one click.

## Deployment to Vercel

The project includes `vercel.json` configured for Single Page Application rewrites and secure headers.
Connect your GitHub repository to Vercel and assign the custom domain `yolofuck.com`.
