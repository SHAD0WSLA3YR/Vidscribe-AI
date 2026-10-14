import { NextResponse } from 'next/server';
import { ASSEMBLY_BASE_URL } from '@/lib/assemblyai';

// This request only starts the AssemblyAI job from a Vercel Blob URL, then
// returns immediately. The browser uploads the video directly to Vercel Blob
// (POST /api/upload token flow) and POSTs the resulting public URL here as
// tiny JSON — video bytes never pass through this serverless function, so
// the 4.5 MB request-body limit does not apply. The browser polls
// GET /api/transcribe/status for completion.
export const maxDuration = 60;

interface TranscribeJsonBody {
  blobUrl?: unknown;
  pathname?: unknown;
  keyterms?: unknown;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    return NextResponse.json(
      { error: 'ASSEMBLYAI_API_KEY not configured' },
      { status: 500 }
    );
  }

  let body: TranscribeJsonBody;
  try {
    body = (await request.json()) as TranscribeJsonBody;
  } catch {
    return NextResponse.json(
      { error: 'blobUrl is required and must be a valid http(s) URL' },
      { status: 400 }
    );
  }

  const blobUrl = typeof body.blobUrl === 'string' ? body.blobUrl : '';
  if (blobUrl.length === 0 || !isValidHttpUrl(blobUrl)) {
    return NextResponse.json(
      { error: 'blobUrl is required and must be a valid http(s) URL' },
      { status: 400 }
    );
  }

  const pathname =
    typeof body.pathname === 'string' && body.pathname.length > 0
      ? body.pathname
      : undefined;

  let keyterms: string[] | null = null;
  if (Array.isArray(body.keyterms)) {
    keyterms = body.keyterms
      .map((item) =>
        typeof item === 'string' ? item.trim() : String(item ?? '').trim()
      )
      .filter((item) => item.length > 0)
      .slice(0, 1000);
  }

  try {
    console.log(
      `[Transcribe] Starting job from blob URL: ${pathname ?? blobUrl}`
    );

    const transcriptPayload: Record<string, unknown> = {
      audio_url: blobUrl,
      speech_model: 'universal', // Supports automatic language detection for 95+ languages
      punctuate: true,
      format_text: true,
      language_detection: true,
    };

    if (keyterms && keyterms.length > 0) {
      transcriptPayload.keyterms_prompt = keyterms;
    }

    const transcriptResponse = await fetch(`${ASSEMBLY_BASE_URL}/transcript`, {
      method: 'POST',
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transcriptPayload),
    });

    if (!transcriptResponse.ok) {
      const errorText = await transcriptResponse.text();
      console.error('AssemblyAI transcription create failed', errorText);
      return NextResponse.json(
        { error: 'Failed to create AssemblyAI transcription job' },
        { status: 502 }
      );
    }

    const transcriptJob = (await transcriptResponse.json()) as {
      id: string;
      status: string;
    };
    console.log(`[Transcribe] Job created: ${transcriptJob.id}`);

    // Return immediately — the client polls GET /api/transcribe/status.
    return NextResponse.json({ jobId: transcriptJob.id });
  } catch (error) {
    console.error('[Transcribe] Transcription failed:', error);
    const details =
      error instanceof Error ? error.message : 'Unexpected server error';

    // Check for specific error types
    if (error instanceof Error) {
      if (
        error.message.includes('payload') ||
        error.message.includes('too large')
      ) {
        return NextResponse.json(
          {
            error:
              'File is too large. Please try a smaller video or compress it.',
            details,
          },
          { status: 413 }
        );
      }
      if (error.message.includes('timeout')) {
        return NextResponse.json(
          {
            error:
              'Request timed out while starting transcription. Please try again.',
            details,
          },
          { status: 504 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to start transcription', details },
      { status: 500 }
    );
  }
}
