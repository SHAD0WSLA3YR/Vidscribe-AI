import { nanoid } from 'nanoid';

/**
 * Shared AssemblyAI helpers for the transcription routes.
 *
 * IMPORTANT: this module must stay free of `process.env` reads so it can
 * never leak server keys if it is ever imported from client code.
 * Callers pass the API key explicitly; only Route Handlers (server-only)
 * read `process.env.ASSEMBLYAI_API_KEY`.
 */

export const ASSEMBLY_BASE_URL = 'https://api.assemblyai.com/v2';

export type AssemblyAIStatus = 'queued' | 'processing' | 'completed' | 'error';

export interface AssemblyAIWord {
  start: number;
  end: number;
  text: string;
}

export interface AssemblyAIParagraph {
  id: string;
  start: number;
  end: number;
  text: string;
  words?: AssemblyAIWord[];
}

export interface AssemblyAITranscript {
  id: string;
  status: AssemblyAIStatus;
  text?: string | null;
  audio_duration?: number | null;
  language_code?: string | null;
  language_confidence?: number | null;
  error?: string | null;
}

export interface NormalizedSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  words: Array<{ start: number; end: number; text: string }>;
}

export interface CompletedTranscription {
  segments: NormalizedSegment[];
  text: string;
  duration: number | null;
  language_code?: string;
}

/** AssemblyAI transcript IDs are URL-safe tokens; reject anything else. */
export function isValidJobId(jobId: unknown): jobId is string {
  return (
    typeof jobId === 'string' &&
    jobId.length >= 8 &&
    jobId.length <= 128 &&
    /^[A-Za-z0-9-]+$/.test(jobId)
  );
}

function toSeconds(ms?: number | null): number | null {
  if (typeof ms !== 'number') return null;
  return ms / 1000;
}

export interface TranscriptionFallback {
  text?: string | null;
  audio_duration?: number | null;
  words?: AssemblyAIWord[];
}

/**
 * Normalize AssemblyAI paragraphs into VidScribe segments.
 * Mirrors the previous synchronous implementation so downstream
 * code (editor, chapters, exports) sees an identical shape.
 */
export function normalizeSegments(
  paragraphs: AssemblyAIParagraph[],
  fallback: TranscriptionFallback
): { segments: NormalizedSegment[]; duration: number | null } {
  const segments = (
    paragraphs.length > 0
      ? paragraphs
      : [
          {
            id: `segment-${nanoid()}`,
            start: 0,
            end: 0,
            text: fallback.text ?? '',
            words: fallback.words ?? [],
          },
        ]
  )
    .filter((segment) =>
      typeof segment.text === 'string' ? segment.text.trim().length > 0 : false
    )
    .map((segment) => {
      const words = Array.isArray(segment.words)
        ? segment.words.map((word) => ({
            start: toSeconds(word.start) ?? toSeconds(segment.start) ?? 0,
            end: toSeconds(word.end) ?? toSeconds(segment.end) ?? 0,
            text: word.text ?? '',
          }))
        : [];

      return {
        id: segment.id ?? `segment-${nanoid()}`,
        start: toSeconds(segment.start) ?? words.at(0)?.start ?? 0,
        end:
          toSeconds(segment.end) ??
          words.at(-1)?.end ??
          toSeconds(segment.start) ??
          0,
        text: typeof segment.text === 'string' ? segment.text : '',
        words,
      };
    });

  const duration =
    typeof fallback.audio_duration === 'number'
      ? fallback.audio_duration
      : (segments.at(-1)?.end ?? null);

  return { segments, duration };
}

export class AssemblyAIError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function assemblyFetch(
  apiKey: string,
  path: string
): Promise<unknown> {
  const response = await fetch(`${ASSEMBLY_BASE_URL}${path}`, {
    headers: { authorization: apiKey },
  });
  if (!response.ok) {
    throw new AssemblyAIError(
      `AssemblyAI request failed with status ${response.status}`,
      response.status
    );
  }
  return (await response.json()) as unknown;
}

/**
 * Fetch a transcript job and, when completed, its paragraphs normalized
 * into the VidScribe shape. Returns the raw status plus the completed
 * payload only when `status === 'completed'`.
 */
export async function fetchTranscriptionResult(
  apiKey: string,
  transcriptId: string
): Promise<
  | { status: 'queued' | 'processing'; transcript: AssemblyAITranscript }
  | {
      status: 'completed';
      transcript: AssemblyAITranscript;
      completed: CompletedTranscription;
    }
  | { status: 'error'; transcript: AssemblyAITranscript }
> {
  const transcript = (await assemblyFetch(
    apiKey,
    `/transcript/${transcriptId}`
  )) as AssemblyAITranscript;

  if (transcript.status === 'completed') {
    let paragraphs: AssemblyAIParagraph[] = [];
    try {
      const paragraphsResponse = await fetch(
        `${ASSEMBLY_BASE_URL}/transcript/${transcript.id}/paragraphs`,
        { headers: { authorization: apiKey } }
      );
      if (paragraphsResponse.ok) {
        const paragraphsData = (await paragraphsResponse.json()) as {
          paragraphs?: AssemblyAIParagraph[];
        };
        paragraphs = paragraphsData.paragraphs ?? [];
      }
    } catch (error) {
      console.warn('AssemblyAI paragraphs fetch failed', error);
    }

    const { segments, duration } = normalizeSegments(paragraphs, {
      text: transcript.text,
      audio_duration: transcript.audio_duration,
    });

    return {
      status: 'completed',
      transcript,
      completed: {
        segments,
        text: transcript.text ?? '',
        duration,
        ...(transcript.language_code
          ? { language_code: transcript.language_code }
          : {}),
      },
    };
  }

  if (transcript.status === 'error') {
    return { status: 'error', transcript };
  }

  return { status: 'processing', transcript };
}
