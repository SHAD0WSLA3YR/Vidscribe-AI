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
User uploads a video (FormData)
  → POST /api/transcribe buffers the file in memory and starts an
    AssemblyAI job, returning immediately with a job ID
  → browser polls GET /api/transcribe/status until the job completes
  → transcript segments render in the Slate editor, synced to video playback
  → /api/chapters, /api/summary, /api/title, /api/explain, /api/translate
    call OpenRouter-hosted chat models for AI features
  → user edits, comments, and translates
  → exports are generated client-side as Blobs and downloaded
```

The browser keeps the video itself local (preview via object URL). Only the audio bytes are sent to AssemblyAI, and only transcript text is sent to OpenRouter. Draft state lives in `localStorage`; the server stores nothing between requests.

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

- `ASSEMBLYAI_API_KEY` — used by `/api/transcribe` to upload audio, create transcription jobs, poll job status, and fetch paragraphs.
- `OPENROUTER_API_KEY` — used by `/api/chapters`, `/api/summary`, `/api/title`, `/api/translate`, and `/api/explain` to call chat models. `/api/explain` also accepts a comma-separated `OPENROUTER_API_KEYS` list and will try each key in turn.

Optional (server-only; each has a default in code):

```ini
# OPENROUTER_API_KEYS=key1,key2
# OPENROUTER_MODEL_LIST=model-a,model-b
# OPENROUTER_MODEL=nvidia/nemotron-3.5-lightning:free
# OPENROUTER_BASE_URL=https://openrouter.ai/api/v1/chat/completions
# OPENROUTER_SITE_URL=https://your-domain.com
# OPENROUTER_APP_NAME=VidScribe AI
# OPENROUTER_MAX_TOKENS_SUMMARY=600
# OPENROUTER_TEMPERATURE=0.7
# OPENROUTER_TOP_P=0.9
# OPENROUTER_TIMEOUT_MS=60000
```

`OPENROUTER_SITE_URL` / `OPENROUTER_APP_NAME` are sent as `HTTP-Referer` / `X-Title` headers for OpenRouter usage metrics. No `NEXT_PUBLIC_*` variables are used — all keys stay server-side.

## AI / External Services

**AssemblyAI** (`/api/transcribe` only): the route buffers the uploaded file in memory, POSTs it to `/v2/upload`, creates a `/v2/transcript` job (`speech_model: "universal"`, `punctuate`, `format_text`, `language_detection`, plus `keyterms_prompt` when the client supplies key terms, capped at 1000), polls the job every 5 seconds until `completed`/`error`, then fetches `/v2/transcript/{id}/paragraphs` and returns normalized segments (`id`, `start`, `end`, `text`, word timings) plus full text and duration.

**OpenRouter** (all other routes): the app uses the OpenAI SDK with `baseURL: https://openrouter.ai/api/v1` to call free-tier chat models. Routes try multiple models in order with retries/backoff on HTTP 429 before failing. Used for: chapters (`/api/chapters`, default max 8), summaries (`/api/summary`), titles (`/api/title`), explanations with selectable level (`/api/explain`), and translation with per-context prompts for transcript/title/summary/chapter (`/api/translate`).

## API Routes

All routes live under `app/api/` and accept/return JSON unless noted.

- `POST /api/transcribe` — accepts `multipart/form-data` with `file` (video) and optional `keyterms` (JSON string array). Uploads to AssemblyAI, creates a transcription job, and returns `{ jobId }` immediately without waiting. Talks to AssemblyAI.
- `GET /api/transcribe/status?jobId=...` — returns `{ status: "processing", jobId }` while the job runs, `{ status: "completed", jobId, segments, text, duration, language_code? }` when done, or `{ status: "error", jobId?, error }` on failure. Each call is a single fast AssemblyAI lookup. Talks to AssemblyAI.
- `POST /api/chapters` — accepts `{ transcript: [{ start, text }], duration?, maxChapters? }`. Returns `{ chapters: [{ id, title, start }] }`. Talks to OpenRouter.
- `POST /api/summary` — accepts `{ transcript, duration? }`. Returns `{ summary }`. Talks to OpenRouter.
- `POST /api/title` — accepts `{ transcript, duration? }`. Returns `{ title }`. Talks to OpenRouter.
- `POST /api/explain` — accepts `{ text, context?, level?: "beginner" | "intermediate" | "advanced" }`. Returns `{ explanation, model }`. Talks to OpenRouter; supports key rotation via `OPENROUTER_API_KEYS`.
- `POST /api/translate` — accepts `{ text, targetLanguage, sourceLanguage?, context?: "transcript" | "title" | "summary" | "chapter" }`. Returns `{ translatedText }`. Talks to OpenRouter.

## Data & Storage

- There is currently **no database**. The server keeps no state between requests.
- Drafts (video name/URL reference, segments, chapters, comments, summary, title, timestamp) persist in browser `localStorage` under the key `lecture-transcript-draft` (`lib/storage.ts`). Clearing the browser storage or calling the in-app clear action removes them.
- Video blobs are never stored server-side; the preview is a temporary in-memory object URL.

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

- `/api/transcribe` returns a job ID immediately and the browser polls `GET /api/transcribe/status` (one fast lookup per poll), so long transcriptions no longer block a serverless function — this fits Vercel Hobby's 60-second limit.
- Uploads still pass **through** the start-transcription request (fully buffered in memory), so very large lecture videos can still hit serverless request-size/memory limits. Direct browser-to-AssemblyAI upload is future work, not implemented.
- Set `ASSEMBLYAI_API_KEY` and `OPENROUTER_API_KEY` (plus optionally `OPENROUTER_SITE_URL` with your production URL) in the Vercel dashboard under Environment Variables. They are needed at runtime, not at build time.

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
