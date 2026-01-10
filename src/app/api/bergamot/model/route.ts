import { NextResponse } from 'next/server';

const GCS_BASE_URL = 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data';

/**
 * GET /api/bergamot/model
 * Proxies Bergamot translation model files from Google Cloud Storage
 * This bypasses CORS restrictions by fetching server-side
 * 
 * Query params:
 *   - url: The full URL of the model file to fetch (URL-encoded)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get('url');

    if (!fileUrl) {
      return NextResponse.json(
        { error: 'Missing required parameter: url' },
        { status: 400 }
      );
    }

    // Validate that the URL is from the expected Google Cloud Storage bucket
    if (!fileUrl.startsWith(GCS_BASE_URL)) {
      return NextResponse.json(
        { error: 'Invalid URL: must be from Mozilla translations bucket' },
        { status: 400 }
      );
    }

    // Fetch the file from Google Cloud Storage
    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
        'User-Agent': 'ZenReadJapanese/1.0',
      },
      // Server-side fetch doesn't have CORS restrictions
    });

    if (!response.ok) {
      console.error(`Failed to fetch Bergamot model file: ${response.status} ${response.statusText} for ${fileUrl}`);
      return NextResponse.json(
        { error: `Failed to fetch file: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the file content as ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();

    // Determine content type based on file extension
    let contentType = 'application/octet-stream';
    if (fileUrl.endsWith('.gz')) {
      contentType = 'application/gzip';
    } else if (fileUrl.endsWith('.bin')) {
      contentType = 'application/octet-stream';
    } else if (fileUrl.endsWith('.spm')) {
      contentType = 'text/plain';
    }

    // Return the file with appropriate headers
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': arrayBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800', // Cache for 1 day, stale for 1 week
        'Access-Control-Allow-Origin': '*', // Allow CORS from any origin
        'Access-Control-Allow-Methods': 'GET',
        'X-Original-URL': fileUrl, // For debugging
      },
    });
  } catch (error) {
    console.error('Error fetching Bergamot model file:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch model file',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

