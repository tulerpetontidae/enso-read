import { NextResponse } from 'next/server';

const REGISTRY_URL = 'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json';
const CACHE_DURATION = 3600; // 1 hour in seconds

// In-memory cache for the registry
let cachedRegistry: any = null;
let cacheTimestamp: number = 0;

/**
 * GET /api/bergamot/registry
 * Proxies the Bergamot translation models registry from Google Cloud Storage
 * This bypasses CORS restrictions by fetching server-side
 */
export async function GET(request: Request) {
  try {
    // Check if we have a valid cached response
    const now = Date.now();
    const cacheAge = (now - cacheTimestamp) / 1000; // age in seconds
    
    if (cachedRegistry && cacheAge < CACHE_DURATION) {
      // Return cached response with appropriate headers
      return NextResponse.json(cachedRegistry, {
        headers: {
          'Cache-Control': `public, max-age=${Math.floor(CACHE_DURATION - cacheAge)}, stale-while-revalidate=86400`,
          'X-Cache': 'HIT',
          'X-Cache-Age': `${Math.floor(cacheAge)}`,
        },
      });
    }

    // Fetch fresh registry from Google Cloud Storage
    const response = await fetch(REGISTRY_URL, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ZenReadJapanese/1.0',
      },
      // Server-side fetch doesn't have CORS restrictions
      next: { revalidate: CACHE_DURATION }, // Next.js cache revalidation
    });

    if (!response.ok) {
      console.error(`Failed to fetch Bergamot registry: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Failed to fetch registry: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Validate response structure
    if (!data || typeof data !== 'object') {
      console.error('Invalid registry format: expected object');
      return NextResponse.json(
        { error: 'Invalid registry format' },
        { status: 500 }
      );
    }

    // Update cache
    cachedRegistry = data;
    cacheTimestamp = now;

    // Return response with caching headers
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, max-age=${CACHE_DURATION}, stale-while-revalidate=86400`,
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error('Error fetching Bergamot registry:', error);
    
    // If we have a stale cache, return it anyway
    if (cachedRegistry) {
      console.warn('Returning stale cached registry due to fetch error');
      return NextResponse.json(cachedRegistry, {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
          'X-Cache': 'STALE',
          'X-Error': error instanceof Error ? error.message : 'Unknown error',
        },
      });
    }

    return NextResponse.json(
      { 
        error: 'Failed to fetch registry',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

