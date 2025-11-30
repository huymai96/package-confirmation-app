import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import * as XLSX from 'xlsx';
import { 
  getFedExVisibilityData, 
  getFedExArrivingToday, 
  getFedExExceptions,
  getConfigStatus,
  isFedExTracking,
  FedExVisibilityShipment
} from '@/app/lib/fedex-integration';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for processing

// Cache for tracking numbers (refresh every 5 minutes)
let trackingNumbersCache: { numbers: string[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get FedEx tracking numbers from our manifests
 * Sanmar primarily uses FedEx Ground
 */
async function getFedExTrackingNumbersFromManifests(): Promise<string[]> {
  // Check cache
  if (trackingNumbersCache && Date.now() - trackingNumbersCache.timestamp < CACHE_TTL) {
    return trackingNumbersCache.numbers;
  }

  const trackingNumbers: Set<string> = new Set();
  
  try {
    const { blobs } = await list({ prefix: 'manifests/' });
    
    // Focus on Sanmar manifests (they use FedEx)
    const sanmarBlobs = blobs.filter(b => 
      b.pathname.toLowerCase().includes('sanmar') &&
      (b.pathname.endsWith('.xlsx') || b.pathname.endsWith('.csv'))
    );
    
    console.log(`FedEx Visibility: Found ${sanmarBlobs.length} Sanmar manifest files`);
    
    for (const blob of sanmarBlobs) {
      try {
        const response = await fetch(blob.url);
        if (!response.ok) continue;
        
        let rows: Record<string, unknown>[] = [];
        
        if (blob.pathname.endsWith('.csv')) {
          const text = await response.text();
          // Simple CSV parsing
          const lines = text.trim().split('\n');
          if (lines.length < 2) continue;
          
          const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
          const trackingIdx = headers.findIndex(h => h.includes('tracking'));
          
          if (trackingIdx >= 0) {
            for (let i = 1; i < lines.length; i++) {
              const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
              const tracking = values[trackingIdx];
              if (tracking && isFedExTracking(tracking)) {
                trackingNumbers.add(tracking);
              }
            }
          }
        } else {
          // Parse XLSX
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
          
          for (const row of rows) {
            // Find tracking column (case-insensitive)
            const trackingKey = Object.keys(row).find(k => 
              k.toLowerCase().includes('tracking')
            );
            
            if (trackingKey) {
              const tracking = String(row[trackingKey] || '').trim();
              if (tracking && isFedExTracking(tracking)) {
                trackingNumbers.add(tracking);
              }
            }
          }
        }
      } catch (e) {
        console.error(`Error processing ${blob.pathname}:`, e);
      }
    }
    
    // Also check tracking index for FedEx numbers
    const indexBlob = blobs.find(b => b.pathname.includes('tracking-index'));
    if (indexBlob) {
      try {
        const response = await fetch(indexBlob.url);
        if (response.ok) {
          const index = await response.json();
          for (const tracking of Object.keys(index)) {
            if (isFedExTracking(tracking)) {
              trackingNumbers.add(tracking);
            }
          }
        }
      } catch (e) {
        console.error('Error reading tracking index:', e);
      }
    }
    
    // Update cache
    const numbers = Array.from(trackingNumbers);
    trackingNumbersCache = { numbers, timestamp: Date.now() };
    
    console.log(`FedEx Visibility: Found ${numbers.length} unique FedEx tracking numbers`);
    return numbers;
    
  } catch (error) {
    console.error('Error getting FedEx tracking numbers:', error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const limit = parseInt(searchParams.get('limit') || '100');

  try {
    // Check configuration
    const config = getConfigStatus();
    if (!config.configured) {
      return NextResponse.json({
        error: 'FedEx not configured',
        ...config,
        message: 'FedEx API credentials not set up'
      }, { status: 500 });
    }

    switch (action) {
      case 'status': {
        // Get tracking numbers count
        const trackingNumbers = await getFedExTrackingNumbersFromManifests();
        return NextResponse.json({
          status: 'ready',
          ...config,
          trackingNumbersAvailable: trackingNumbers.length,
          message: 'FedEx Visibility is configured and ready',
          note: 'Using polling-based visibility (Track API). For real-time updates, set up FedEx AIV webhook.'
        });
      }

      case 'all': {
        // Get all FedEx visibility data
        const trackingNumbers = await getFedExTrackingNumbersFromManifests();
        const limitedNumbers = trackingNumbers.slice(0, limit);
        
        const allShipments = await getFedExVisibilityData(limitedNumbers);
        const inbound = allShipments.filter(s => s.direction === 'inbound');
        const outbound = allShipments.filter(s => s.direction === 'outbound');
        
        return NextResponse.json({
          success: true,
          source: 'polling',
          trackingNumbersQueried: limitedNumbers.length,
          trackingNumbersTotal: trackingNumbers.length,
          total: allShipments.length,
          inbound: {
            count: inbound.length,
            shipments: inbound
          },
          outbound: {
            count: outbound.length,
            shipments: outbound
          }
        });
      }

      case 'inbound': {
        // Get inbound shipments only
        const trackingNumbers = await getFedExTrackingNumbersFromManifests();
        const limitedNumbers = trackingNumbers.slice(0, limit);
        
        const allShipments = await getFedExVisibilityData(limitedNumbers);
        const inbound = allShipments.filter(s => s.direction === 'inbound');
        
        return NextResponse.json({
          success: true,
          source: 'polling',
          count: inbound.length,
          shipments: inbound
        });
      }

      case 'outbound': {
        // Get outbound shipments only
        const trackingNumbers = await getFedExTrackingNumbersFromManifests();
        const limitedNumbers = trackingNumbers.slice(0, limit);
        
        const allShipments = await getFedExVisibilityData(limitedNumbers);
        const outbound = allShipments.filter(s => s.direction === 'outbound');
        
        return NextResponse.json({
          success: true,
          source: 'polling',
          count: outbound.length,
          shipments: outbound
        });
      }

      case 'arriving-today': {
        // Get packages arriving today
        const trackingNumbers = await getFedExTrackingNumbersFromManifests();
        const arrivingToday = await getFedExArrivingToday(trackingNumbers.slice(0, limit));
        
        return NextResponse.json({
          success: true,
          source: 'polling',
          count: arrivingToday.length,
          date: new Date().toISOString().split('T')[0],
          shipments: arrivingToday
        });
      }

      case 'exceptions': {
        // Get exception shipments
        const trackingNumbers = await getFedExTrackingNumbersFromManifests();
        const exceptions = await getFedExExceptions(trackingNumbers.slice(0, limit));
        
        return NextResponse.json({
          success: true,
          source: 'polling',
          count: exceptions.length,
          shipments: exceptions
        });
      }

      case 'delivered': {
        // Get delivered shipments
        const trackingNumbers = await getFedExTrackingNumbersFromManifests();
        const limitedNumbers = trackingNumbers.slice(0, limit);
        
        const allShipments = await getFedExVisibilityData(limitedNumbers);
        const delivered = allShipments.filter(s => 
          s.statusDescription?.toLowerCase().includes('delivered') ||
          s.actualDelivery
        );
        
        return NextResponse.json({
          success: true,
          source: 'polling',
          count: delivered.length,
          shipments: delivered
        });
      }

      default:
        return NextResponse.json({
          endpoint: '/api/fedex-visibility',
          description: 'FedEx Visibility API (polling-based, equivalent to UPS Quantum View)',
          actions: {
            'status': 'Check FedEx visibility status and config',
            'all': 'Get all inbound + outbound shipments',
            'inbound': 'Get inbound shipments only (to our warehouses)',
            'outbound': 'Get outbound shipments only',
            'arriving-today': 'Get packages arriving today',
            'exceptions': 'Get delayed/exception shipments',
            'delivered': 'Get delivered shipments'
          },
          parameters: {
            'limit': 'Max tracking numbers to query (default: 100)'
          },
          note: 'This uses the FedEx Track API for visibility. For real-time updates, configure FedEx AIV webhook at /api/webhooks/fedex'
        });
    }
  } catch (error) {
    console.error('FedEx Visibility API error:', error);
    return NextResponse.json({
      error: String(error),
      message: 'Failed to fetch FedEx visibility data'
    }, { status: 500 });
  }
}

// POST endpoint for custom tracking number lists
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trackingNumbers = body.trackingNumbers || [];
    
    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return NextResponse.json({
        error: 'trackingNumbers array is required',
        usage: 'POST { trackingNumbers: ["1234567890123", ...] }'
      }, { status: 400 });
    }

    // Filter to FedEx numbers only
    const fedexNumbers = trackingNumbers.filter((t: string) => isFedExTracking(t));
    
    if (fedexNumbers.length === 0) {
      return NextResponse.json({
        error: 'No valid FedEx tracking numbers provided',
        provided: trackingNumbers.length,
        fedexFormat: 0
      }, { status: 400 });
    }

    // Limit to 100
    const limitedNumbers = fedexNumbers.slice(0, 100);
    
    const allShipments = await getFedExVisibilityData(limitedNumbers);
    const inbound = allShipments.filter(s => s.direction === 'inbound');
    const outbound = allShipments.filter(s => s.direction === 'outbound');
    const exceptions = allShipments.filter(s => s.isException);
    
    return NextResponse.json({
      success: true,
      source: 'custom',
      trackingNumbersProvided: trackingNumbers.length,
      trackingNumbersQueried: limitedNumbers.length,
      total: allShipments.length,
      stats: {
        inbound: inbound.length,
        outbound: outbound.length,
        exceptions: exceptions.length
      },
      inbound: {
        count: inbound.length,
        shipments: inbound
      },
      outbound: {
        count: outbound.length,
        shipments: outbound
      }
    });

  } catch (error) {
    console.error('FedEx Visibility POST error:', error);
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}

