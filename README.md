# VidScribe AI

VidScribe AI is a web app that turns lecture videos into editable, timestamped transcripts with AI-generated chapters, summaries, titles, explanations, and translations, plus one-click exports.

Upload a video, get a transcript you can edit while the video stays in sync, generate study notes with AI, and export the result as PDF, DOCX, Markdown, TXT, or VTT.

## Features

- **Video upload** — drag-and-drop or file picker; accepts MP4, WebM, MOV (QuickTime), and MKV, with inline playback and a local preview.
- **Transcription** — audio is sent to AssemblyAI (universal speech model with automatic language detection) with optional key-term prompting for technical vocabulary.
- **Transcript editor** — Slate-based rich-text editing (bold/italic/underline), inline comments, and real-time sync between transcript segments and video playback position.
- **Chapter generation** — AI groups the transcript into titled, timestamped chapters; chapters can be renamed and reordered manually.
- **Summaries** — one-click lecture summary generated from the transcript.
- **Title generation** — a descriptive title sampled from the beginning, middle, and end of the transcript.
- **Explanations** — highlight any excerpt and get a short explanation at beginner, intermediate, or advanced level.
- **Translation** — translate transcript text, titles, summaries, and chapter titles into a target language.
- **Local draft saving** — work-in-progress (transcript, chapters, comments, summary, title) autosaves to browser `localStorage` and survives refreshes.
- **Exports** — PDF, DOCX, Markdown, TXT, and VTT, optionally including chapters, summary, and unresolved notes.
- **UI extras** — dark/light theme toggle, keyboard shortcuts with a help panel, offline indicator, and multi-language UI selector.

## How It Works

```
User selects a video
  → browser uploads it directly to Vercel Blob (POST /api/upload token
    exchange — video bytes never pass through a serverless function, so
    the 4.5 MB function body limit does not apply)
  → POST /api/transcribe with the blob URL starts the AssemblyAI job,
    returning immediately with a job ID
  → browser polls GET /api/transcribe/status until the job completes
  → transcript segments render in the Slate editor, synced to video playback
  → /api/chapters, /api/summary, /api/title, /api/explain, /api/translate
    call OpenRouter-hosted chat models for AI features
  → user edits, comments, and translates
  → exports are generated client-side as Blobs and downloaded
```

The browser uploads the video to Vercel Blob storage (public URL, source of truth for AssemblyAI), keeps a local preview via object URL, and only transcript text is sent to OpenRouter. Once the transcription completes, the status endpoint deletes the blob. Draft state lives in `localStorage`; the server stores nothing between requests.

## Tech Stack

- Next.js 15 (App Router, Route Handlers) + React 18
- TypeScript
- Tailwind CSS (+ `@tailwindcss/forms`)
- Slate / slate-react / slate-history (transcript editor)
- OpenAI SDK configured against the OpenRouter API (`https://openrouter.ai/api/v1`)
- AssemblyAI REST API (via `fetch`, no dedicated SDK)
- jsPDF and `docx` for client-side PDF/DOCX export
- npm (see `package-lock.json`)

## Project Structure

```
app/
  page.tsx            # main client UI (upload → edit → AI → export)
  layout.tsx          # root layout
  globals.css         # global styles
  api/
    transcribe/       # video → transcript via AssemblyAI
    chapters/         # transcript → chapters via OpenRouter
    summary/          # transcript → summary via OpenRouter
    title/            # transcript → title via OpenRouter
    explain/          # excerpt → explanation via OpenRouter
    translate/        # text → translation via OpenRouter
components/           # UI pieces (editor, video player, export menu, chapter list, …)
hooks/                # React hooks (keyboard shortcuts, network status)
lib/                  # storage (localStorage), exporters, Slate helpers, networking, utils
types/                # shared TypeScript types (segments, chapters, comments, drafts)
public/               # static assets
```

Only top-level folders are shown; see the repo for the full file list.

## Getting Started

1. Clone the repository:

   ```bash
   git clone <your-repo-url>
   cd <repo-directory>
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create the local env file:

   ```bash
   cp .env.example .env.local
   ```

4. Add the required keys to `.env.local` (see Environment Variables below).

5. Run the development server:

   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) and upload a video.

## Environment Variables

Required (server-only; the app returns a 500 from the relevant route if missing):

```ini
ASSEMBLYAI_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here
```

- `ASSEMBLYAI_API_KEY` — used by `/api/transcribe` to create transcription jobs, poll job status, and fetch paragraphs.
- `OPENROUTER_API_KEY` — used by `/api/chapters`, `/api/summary`, `/api/title`, `/api/translate`, and `/api/explain` to call chat models. `/api/explain` also accepts a comma-separated `OPENROUTER_API_KEYS` list and will try each key in turn.
- `BLOB_READ_WRITE_TOKEN` — required by `/api/upload` to mint client-upload tokens (video uploads go browser → Vercel Blob directly). Vercel auto-injects this when a Blob store is linked to the project; locally it comes from `vercel env pull`.

Optional (server-only; each has a default in code):

```ini
# OPENROUTER_API_KEYS=key1,key2
# OPENROUTER_MODEL_LIST=model-a,model-b
# OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1/chat/completions
# OPENROUTER_SITE_URL=https://your-domain.com
# OPENROUTER_APP_NAME=VidScribe AI
# BLOB_MAX_UPLOAD_SIZE_MB=512
# OPENROUTER_MAX_TOKENS_SUMMARY=600
# OPENROUTER_TEMPERATURE=0.7
# OPENROUTER_TOP_P=0.9
# OPENROUTER_TIMEOUT_MS=60000
```

`OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME` are sent as `HTTP-Referer` / `X-Title` headers for OpenRouter usage metrics. No `NEXT_PUBLIC_*` variables are used — all keys stay server-side.

## AI / External Services

**AssemblyAI** (`/api/transcribe` and `/api/transcribe/status`): the transcribe route receives the Vercel Blob URL from the client and creates a `/v2/transcript` job with `audio_url` = that URL (`speech_model: "universal"`, `punctuate`, `format_text`, `language_detection`, plus `keyterms_prompt` when the client supplies key terms, capped at 1000). The status route polls the job until `completed`/`error`, then fetches `/v2/transcript/{id}/paragraphs` and returns normalized segments (`id`, `start`, `end`, `text`, word timings) plus full text and duration — and deletes the source blob from Vercel Blob once the job completes.

**OpenRouter** (all other routes): the app uses the OpenAI SDK with `baseURL: https://openrouter.ai/api/v1` to call free-tier chat models. Routes try multiple models in order with retries/backoff on HTTP 429 before failing. Used for: chapters (`/api/chapters`, default max 8), summaries (`/api/summary`), titles (`/api/title`), explanations with selectable level (`/api/explain`), and translation with per-context prompts for transcript/title/summary/chapter (`/api/translate`).

## API Routes

All routes live under `app/api/` and accept/return JSON unless noted.

- `POST /api/upload` — used by the client-upload flow. Issues a short-lived upload token and returns the Blob store upload URL. Accepts video MIME types, server-enforced max size (default 512 MB via `BLOB_MAX_UPLOAD_SIZE_MB`). Talks to Vercel Blob.
- `POST /api/transcribe` — accepts JSON `{ blobUrl, pathname?, keyterms? }` (the video must already be in Vercel Blob; the video bytes never pass through this endpoint). Creates the AssemblyAI job with `audio_url` = blob URL and returns `{ jobId }` immediately without waiting. Talks to AssemblyAI.
- `GET /api/transcribe/status?jobId=...&blobUrl=...` — returns `{ status: "processing", jobId }` while the job runs, `{ status: "completed", jobId, segments, text, duration, language_code? }` when done, or `{ status: "error", jobId?, error }` on failure. On completion it also deletes the source blob from Vercel Blob (fire-and-forget; the `blobUrl` query param is optional). Each call is a single fast AssemblyAI lookup. Talks to AssemblyAI.
- `POST /api/chapters` — accepts `{ transcript: [{ start, text }], duration?, maxChapters? }`. Returns `{ chapters: [{ id, title, start }] }`. Talks to OpenRouter.
- `POST /api/summary` — accepts `{ transcript, duration? }`. Returns `{ summary }`. Talks to OpenRouter.
- `POST /api/title` — accepts `{ transcript, duration? }`. Returns `{ title }`. Talks to OpenRouter.
- `POST /api/explain` — accepts `{ text, context?, level?: "beginner" | "intermediate" | "advanced" }`. Returns `{ explanation, model }`. Talks to OpenRouter; supports key rotation via `OPENROUTER_API_KEYS`.
- `POST /api/translate` — accepts `{ text, targetLanguage, sourceLanguage?, context?: "transcript" | "title" | "summary" | "chapter" }`. Returns `{ translatedText }`. Talks to OpenRouter.

## Data & Storage

- There is currently **no database**. The server keeps no state between requests.
- Drafts (video name/URL reference, segments, chapters, comments, summary, title, timestamp) persist in browser `localStorage` under the key `lecture-transcript-draft` (`lib/storage.ts`). Clearing the browser storage or calling the in-app clear action removes them.
- Video blobs live in Vercel Blob storage while a transcription is active and are deleted automatically once it completes; the in-app preview uses a temporary in-memory object URL.

## Exporting

Exports are generated **client-side** (`lib/exporters.ts` → `segmentsToBlob`) and downloaded as files:

- `vtt` — WebVTT cues from segments.
- `txt` — title, chapters, summary, unresolved notes, then timestamped transcript.
- `md` — same content as Markdown.
- `docx` — same content as a Word document (via the `docx` package).
- `pdf` — same content as a PDF (via `jspdf`).

Note: `jszip` is listed in `package.json` but is not currently imported by application code, so multi-file/ZIP export is not implemented.

## Deployment

Intended target: **Vercel**.

### Current Deployment Notes

- **Uploads bypass the 4.5 MB function body limit**: videos are uploaded client-side to Vercel Blob (token-exchange flow via `/api/upload`), then `/api/transcribe` receives only a tiny JSON payload with the blob URL. Vercel's 4.5 MB request-body limit no longer applies to video uploads.
- `/api/transcribe` returns a job ID immediately and the browser polls `GET /api/transcribe/status` (one fast lookup per poll). Both fit comfortably inside Vercel Hobby's 300-second (5-minute) function limit.
- Blobs are deleted automatically once transcription completes, so storage usage tracks active transcription volume. Note: the `/api/upload` route currently issues tokens to any caller (this app has no auth system) — acceptable for dev/preview, but add user authentication inside `onBeforeGenerateToken` before public production use.
- Required env vars in the Vercel dashboard: `ASSEMBLYAI_API_KEY`, `OPENROUTER_API_KEY`, and `BLOB_READ_WRITE_TOKEN` (auto-linked when you add a Blob store to the project). Optional: `BLOB_MAX_UPLOAD_SIZE_MB`. They are needed at runtime, not at build time.

## Development

Commands from `package.json`:

```bash
npm run dev    # start dev server (next dev)
npm run build  # production build (next build)
npm start      # run production build (next start)
npm run lint   # lint (next lint)
```

## License

License has not been added yet.

## Contributing

No contribution process is defined yet. Open an issue or a pull request if you want to help.

## Security

- API keys belong in `.env.local` (local) or in the deployment platform's environment-variable settings (production, e.g. Vercel dashboard).
- `.env.local` must never be committed — it is listed in `.gitignore`, and the repo's git index has been cleaned of it.
- Never put real API keys in `README.md`, `.env.example`, or any committed file. Use placeholders such as `ASSEMBLYAI_API_KEY=your_key_here`.
- If a key is ever committed, rotate it immediately: old commits keep a copy forever.
