import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const LABEL_API_KEY = process.env.LABEL_API_KEY || 'promos-label-2024';
const INDEX_BLOB_NAME = 'tracking-index.json';

interface IndexEntry {
  source: string;
  sourceType: 'sanmar' | 'ss' | 'customink' | 'inbound' | 'unknown';
  po: string;
  customer: string;
  department?: string;
  dueDate?: string;
  status?: string;
  shipperName?: string;
  referenceTokens?: string[];
}

interface TrackingIndex {
  [tracking: string]: IndexEntry;
}

// Cache the index in memory (refreshed every 5 minutes)
let cachedIndex: TrackingIndex | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch the pre-built index
async function getIndex(): Promise<TrackingIndex | null> {
  const now = Date.now();
  
  // Return cached if still valid
  if (cachedIndex && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedIndex;
  }
  
  try {
    const { blobs } = await list();
    const indexBlob = blobs.find(b => b.pathname === INDEX_BLOB_NAME);
    
    if (!indexBlob) {
      console.log('Index not found - needs to be built');
      return null;
    }
    
    const response = await fetch(indexBlob.url);
    if (!response.ok) {
      console.error('Failed to fetch index');
      return null;
    }
    
    cachedIndex = await response.json();
    cacheTimestamp = now;
    
    console.log(`Index loaded: ${Object.keys(cachedIndex || {}).length} trackings`);
    return cachedIndex;
    
  } catch (error) {
    console.error('Error loading index:', error);
    return null;
  }
}

function normalizeTracking(tracking: string): string {
  return tracking.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// GET - Main lookup endpoint
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const tracking = searchParams.get('tracking');
  const apiKey = request.headers.get('x-api-key') || searchParams.get('key');

  // Allow info without auth
  if (!action || action === 'info') {
    return NextResponse.json({
      endpoint: 'Promos Ink Label Print - Cloud API v3.0 (Indexed)',
      version: '3.0',
      actions: {
        lookup: 'GET ?action=lookup&tracking=1Z...',
        health: 'GET ?action=health',
        stats: 'GET ?action=stats'
      },
      authentication: 'Include x-api-key header or ?key= parameter',
      note: 'Index-based lookup for instant results'
    });
  }

  // Health check without auth
  if (action === 'health') {
    const index = await getIndex();
    return NextResponse.json({ 
      status: index ? 'ok' : 'index_missing',
      timestamp: new Date().toISOString(),
      version: '3.0',
      indexLoaded: !!index,
      trackingCount: index ? Object.keys(index).length : 0
    });
  }

  // Auth required for other actions
  if (apiKey !== LABEL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Stats
  if (action === 'stats') {
    const index = await getIndex();
    if (!index) {
      return NextResponse.json({ 
        error: 'Index not built',
        message: 'POST to /api/build-index to build the tracking index'
      }, { status: 404 });
    }
    
    const entries = Object.values(index);
    return NextResponse.json({
      totalTrackings: entries.length,
      bySoure: {
        sanmar: entries.filter(e => e.sourceType === 'sanmar').length,
        ss: entries.filter(e => e.sourceType === 'ss').length,
        inbound: entries.filter(e => e.sourceType === 'inbound').length
      },
      cacheAge: Date.now() - cacheTimestamp
    });
  }

  // Lookup tracking - INSTANT with index
  if (action === 'lookup') {
    if (!tracking) {
      return NextResponse.json({ error: 'Missing tracking parameter' }, { status: 400 });
    }

    const index = await getIndex();
    
    if (!index) {
      return NextResponse.json({ 
        found: false,
        tracking: tracking,
        error: 'Index not built. Please wait while administrator rebuilds the index.',
        needsRebuild: true
      });
    }
    
    const normalizedTracking = normalizeTracking(tracking);
    const entry = index[normalizedTracking];
    
    if (entry) {
      return NextResponse.json({
        found: true,
        tracking: tracking,
        source: entry.source,
        sourceType: entry.sourceType,
        po: entry.po,
        customer: entry.customer,
        department: entry.department,
        dueDate: entry.dueDate,
        status: entry.status,
        pipelineFlag: entry.pipelineFlag,
        shipperName: entry.shipperName,
        referenceTokens: entry.referenceTokens
      });
    } else {
      return NextResponse.json({
        found: false,
        tracking: tracking,
        message: 'Package not found in index'
      });
    }
  }

  // Clear cache (force refresh)
  if (action === 'refresh') {
    cachedIndex = null;
    cacheTimestamp = 0;
    const index = await getIndex();
    return NextResponse.json({
      success: true,
      message: 'Cache cleared and index reloaded',
      trackingCount: index ? Object.keys(index).length : 0
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// POST - Batch lookup
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  
  if (apiKey !== LABEL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const trackingNumbers: string[] = body.trackingNumbers || body.tracking || [];

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return NextResponse.json({ error: 'Missing trackingNumbers array' }, { status: 400 });
    }

    const index = await getIndex();
    
    if (!index) {
      return NextResponse.json({ 
        error: 'Index not built',
        message: 'POST to /api/build-index to build the tracking index'
      }, { status: 404 });
    }

    const limitedNumbers = trackingNumbers.slice(0, 100);
    const results = limitedNumbers.map(tracking => {
      const normalized = normalizeTracking(tracking);
      const entry = index[normalized];
      
      if (entry) {
        return {
          found: true,
          tracking: tracking,
          ...entry
        };
      } else {
        return {
          found: false,
          tracking: tracking
        };
      }
    });

    return NextResponse.json({
      total: limitedNumbers.length,
      found: results.filter(r => r.found).length,
      results
    });

  } catch (error) {
    console.error('Batch lookup error:', error);
    return NextResponse.json({ error: 'Failed to process batch lookup' }, { status: 500 });
  }
}
