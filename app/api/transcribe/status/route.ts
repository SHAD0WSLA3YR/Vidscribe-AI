import { NextResponse } from 'next/server';
// Verified against node_modules/@vercel/blob@2.8.1: `del` is exported from
// the base `@vercel/blob` import (dist/index.d.ts) and accepts a full URL or
// a pathname: del(urlOrPathname: string | string[], ...).
import { del } from '@vercel/blob';
import {
  AssemblyAIError,
  fetchTranscriptionResult,
  isValidJobId,
} from '@/lib/assemblyai';

/**
 * Poll endpoint for transcription jobs started via POST /api/transcribe.
 *
 * GET /api/transcribe/status?jobId=<assemblyai-transcript-id>
 *
 * Each call is a single fast AssemblyAI lookup — safe for serverless
 * execution limits no matter how long the transcription takes.
 */
export async function GET(request: Request) {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    return NextResponse.json(
      { status: 'error', error: 'ASSEMBLYAI_API_KEY not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const blobUrl = searchParams.get('blobUrl');
  const pathname = searchParams.get('pathname');

  if (!isValidJobId(jobId)) {
    return NextResponse.json(
      { status: 'error', error: 'Valid jobId query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const result = await fetchTranscriptionResult(
      process.env.ASSEMBLYAI_API_KEY,
      jobId
    );

    if (result.status === 'completed') {
      if (result.transcript.language_code) {
        console.log(
          `[Transcribe] Job ${jobId} completed (language: ${result.transcript.language_code})`
        );
      }
      // Storage cleanup: AssemblyAI has already fetched the audio, so the
      // source blob is no longer needed. Fire-and-forget — cleanup must
      // never fail the request. Prefer the pathname when provided, else the
      // full blob URL (del() accepts either).
      const blobTarget = pathname ?? blobUrl;
      if (blobTarget) {
        try {
          void del(blobTarget).catch((err: unknown) => {
            console.warn('[Blob] cleanup delete failed', err);
          });
        } catch (err) {
          console.warn('[Blob] cleanup delete failed', err);
        }
      }
      return NextResponse.json({
        status: 'completed',
        jobId,
        segments: result.completed.segments,
        text: result.completed.text,
        duration: result.completed.duration,
        ...(result.completed.language_code
          ? { language_code: result.completed.language_code }
          : {}),
      });
    }

    if (result.status === 'error') {
      console.error(
        '[Transcribe] AssemblyAI transcription error:',
        result.transcript.error
      );
      return NextResponse.json(
        {
          status: 'error',
          jobId,
          error: `AssemblyAI transcription failed: ${result.transcript.error ?? 'unknown error'}`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ status: 'processing', jobId });
  } catch (error) {
    if (error instanceof AssemblyAIError) {
      if (error.status === 404) {
        return NextResponse.json(
          { status: 'error', jobId, error: 'Transcription job not found' },
          { status: 404 }
        );
      }
      console.error('[Transcribe] AssemblyAI status lookup failed:', error);
      return NextResponse.json(
        { status: 'error', jobId, error: 'Failed to check transcription status' },
        { status: 502 }
      );
    }
    console.error('[Transcribe] Status check failed:', error);
    return NextResponse.json(
      { status: 'error', jobId, error: 'Failed to check transcription status' },
      { status: 500 }
    );
  }
}
