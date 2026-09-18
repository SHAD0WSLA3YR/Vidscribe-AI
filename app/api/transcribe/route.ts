import { NextResponse } from 'next/server';
import { ASSEMBLY_BASE_URL } from '@/lib/assemblyai';

// This request only uploads the file and starts the AssemblyAI job, then
// returns immediately. The browser polls GET /api/transcribe/status for
// completion, so long transcriptions never block a serverless function.
export const maxDuration = 60;

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
