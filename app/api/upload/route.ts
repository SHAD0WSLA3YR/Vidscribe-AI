import { NextResponse } from 'next/server';
// Verified against node_modules/@vercel/blob@2.8.1: `handleUpload` and
// `HandleUploadBody` are exported from the `@vercel/blob/client` subpath
// (dist/client.d.ts), NOT from the base `@vercel/blob` import.
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

// NOTE: this app has NO auth system, so this route issues client-upload
// tokens to any caller. Acceptable for dev/preview; MUST add auth
// (e.g. check a session/JWT inside onBeforeGenerateToken and throw on
// failure) before production — see Vercel Blob client-upload docs.
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          'video/mp4',
          'video/webm',
          'video/quicktime',
          'video/x-matroska',
        ],
        addRandomSuffix: true,
        maximumSizeInBytes:
          (Number(process.env.BLOB_MAX_UPLOAD_SIZE_MB) || 512) * 1024 * 1024,
      }),
      onUploadCompleted: async ({ blob }) => {
        // Note: PutBlobResult has no `size` field (url, pathname,
        // contentType, ...), so log pathname + url.
        console.log('[Blob] upload completed', blob.pathname, blob.url);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
