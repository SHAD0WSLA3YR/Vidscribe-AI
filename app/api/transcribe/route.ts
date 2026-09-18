import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

const ASSEMBLY_BASE_URL = 'https://api.assemblyai.com/v2';
const POLL_INTERVAL_MS = 5_000; // Poll every 5 seconds
const POLL_TIMEOUT_MS = 120 * 60 * 1_000; // 120 minutes (2 hours) - enough for very long videos

// Configure route for longer execution time
export const maxDuration = 300; // 5 minutes max execution (Vercel Pro allows up to 300s)

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSeconds(ms?: number | null) {
  if (typeof ms !== 'number') return null;
  return ms / 1000;
}

export async function POST(request: Request) {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    return NextResponse.json(
      { error: 'ASSEMBLYAI_API_KEY not configured' },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File not provided' }, { status: 400 });
  }

  let keyterms: string[] | null = null;
  const keytermsInput = formData.get('keyterms');
  if (typeof keytermsInput === 'string') {
    try {
      const parsed = JSON.parse(keytermsInput);
      if (Array.isArray(parsed)) {
        keyterms = parsed
          .map((item) =>
            typeof item === 'string' ? item.trim() : String(item ?? '')
          )
          .filter((item) => item.length > 0)
          .slice(0, 1000);
      }
    } catch (error) {
      console.warn('Failed to parse keyterms_prompt JSON', error);
    }
  }

  try {
    console.log(
      `[Transcribe] Processing file: ${file.name}, size: ${file.size} bytes`
    );
    const buffer = Buffer.from(await file.arrayBuffer());
    console.log(`[Transcribe] Buffer created, uploading to AssemblyAI...`);

    const uploadResponse = await fetch(`${ASSEMBLY_BASE_URL}/upload`, {
      method: 'POST',
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/octet-stream',
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[Transcribe] AssemblyAI upload failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to upload audio to AssemblyAI' },
        { status: 502 }
      );
    }

    const { upload_url: uploadUrl } = (await uploadResponse.json()) as {
      upload_url: string;
    };
    console.log(
      `[Transcribe] File uploaded successfully, starting transcription...`
    );

    const transcriptPayload: Record<string, unknown> = {
      audio_url: uploadUrl,
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
    console.log(
      `[Transcribe] Job created: ${transcriptJob.id}, polling for completion...`
    );

    const startedAt = Date.now();
    let transcriptResult: any = null;
    let pollCount = 0;
    // Poll for completion
    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      pollCount++;
      const pollingResponse = await fetch(
        `${ASSEMBLY_BASE_URL}/transcript/${transcriptJob.id}`,
        {
          headers: {
            authorization: process.env.ASSEMBLYAI_API_KEY!,
          },
        }
      );

      if (!pollingResponse.ok) {
        const errorText = await pollingResponse.text();
        console.error('[Transcribe] AssemblyAI polling failed:', errorText);
        return NextResponse.json(
          { error: 'Failed to poll AssemblyAI transcript status' },
          { status: 502 }
        );
      }

      const pollingData = await pollingResponse.json();

      // Log status every 10 polls
      if (pollCount % 10 === 0) {
        console.log(
          `[Transcribe] Poll #${pollCount}, status: ${
            pollingData.status
          }, elapsed: ${Math.round((Date.now() - startedAt) / 1000)}s`
        );
      }

      if (pollingData.status === 'completed') {
        transcriptResult = pollingData;
        console.log(
          `[Transcribe] Transcription completed after ${pollCount} polls (${Math.round(
            (Date.now() - startedAt) / 1000
          )}s)`
        );
        if (pollingData.language_code) {
          console.log(
            `[Transcribe] Detected language: ${pollingData.language_code} (confidence: ${pollingData.language_confidence ?? 'N/A'})`
          );
        }
        break;
      }
      if (pollingData.status === 'error') {
        console.error(
          '[Transcribe] AssemblyAI transcription error:',
          pollingData.error
        );
        return NextResponse.json(
          { error: `AssemblyAI transcription failed: ${pollingData.error}` },
          { status: 502 }
        );
      }
      await sleep(POLL_INTERVAL_MS);
    }

    if (!transcriptResult) {
      console.error(
        `[Transcribe] Transcription timed out after ${pollCount} polls`
      );
      return NextResponse.json(
        { error: 'AssemblyAI transcription timed out' },
        { status: 504 }
      );
    }

    let paragraphs: Array<{
      id: string;
      start: number;
      end: number;
      text: string;
      words?: Array<{ start: number; end: number; text: string }>;
    }> = [];

    try {
      const paragraphsResponse = await fetch(
        `${ASSEMBLY_BASE_URL}/transcript/${transcriptResult.id}/paragraphs`,
        {
          headers: {
            authorization: process.env.ASSEMBLYAI_API_KEY!,
          },
        }
      );

      if (paragraphsResponse.ok) {
        const paragraphsData = (await paragraphsResponse.json()) as {
          paragraphs?: Array<{
            id: string;
            start: number;
            end: number;
            text: string;
            words?: Array<{ start: number; end: number; text: string }>;
          }>;
        };
        paragraphs = paragraphsData.paragraphs ?? [];
      }
    } catch (error) {
      console.warn('AssemblyAI paragraphs fetch failed', error);
    }

    const segments = (
      paragraphs.length > 0
        ? paragraphs
        : [
            {
              id: `segment-${nanoid()}`,
              start: transcriptResult.start ?? 0,
              end: transcriptResult.end ?? null,
              text: transcriptResult.text ?? '',
              words: transcriptResult.words ?? [],
            },
          ]
    )
      .filter((segment) =>
        typeof segment.text === 'string'
          ? segment.text.trim().length > 0
          : false
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
      typeof transcriptResult.audio_duration === 'number'
        ? transcriptResult.audio_duration
        : segments.at(-1)?.end ?? null;

    return NextResponse.json({
      segments,
      text: transcriptResult.text,
      duration,
    });
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
              'Request timed out. Very long videos may need more time to process.',
            details,
          },
          { status: 504 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to transcribe video', details },
      { status: 500 }
    );
  }
}
