import { NextResponse } from 'next/server';
import { trackPackage as trackUPS, isConfigured as isUPSConfigured } from '@/app/lib/ups-integration';
import { trackPackage as trackFedEx, isConfigured as isFedExConfigured, isFedExTracking } from '@/app/lib/fedex-integration';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for batch processing

// Detect carrier from tracking number
function detectCarrier(tracking: string): 'ups' | 'fedex' | 'unknown' {
  const cleaned = tracking.trim().toUpperCase();
  if (/^1Z[A-Z0-9]{16}$/i.test(cleaned)) return 'ups';
  if (isFedExTracking(cleaned)) return 'fedex';
  return 'unknown';
}

interface BatchResult {
  tracking: string;
  carrier: string;
  status: string;
  statusDescription: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  service?: string;
  origin?: string;
  destination?: string;
  signedBy?: string;
  isException: boolean;
  poNumber?: string;
  shipperReference?: string;
  shipperName?: string;
  error?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let trackingNumbers: string[] = body.trackingNumbers || [];
    
    // Also accept comma or newline separated string
    if (body.trackingList && typeof body.trackingList === 'string') {
      trackingNumbers = body.trackingList
        .split(/[\n,;]+/)
        .map((t: string) => t.trim())
        .filter((t: string) => t.length > 5);
    }

    if (trackingNumbers.length === 0) {
      return NextResponse.json({
        error: 'No tracking numbers provided',
        usage: 'POST with { trackingNumbers: ["1Z...", "789..."] } or { trackingList: "1Z...\\n789..." }'
      }, { status: 400 });
    }

    // Limit to 50 at a time
    if (trackingNumbers.length > 50) {
      trackingNumbers = trackingNumbers.slice(0, 50);
    }

    const results: BatchResult[] = [];
    const stats = {
      total: trackingNumbers.length,
      delivered: 0,
      inTransit: 0,
      exceptions: 0,
      unknown: 0
    };

    // Process each tracking number
    for (const tracking of trackingNumbers) {
      const carrier = detectCarrier(tracking);
      
      try {
        if (carrier === 'ups' && isUPSConfigured()) {
          const data = await trackUPS(tracking);
          if (data) {
            const isDelivered = data.statusDescription?.toLowerCase().includes('delivered');
            const isInTransit = data.statusDescription?.toLowerCase().includes('transit') || 
                               data.statusDescription?.toLowerCase().includes('on the way');
            
            if (isDelivered) stats.delivered++;
            else if (data.isException) stats.exceptions++;
            else if (isInTransit) stats.inTransit++;
            else stats.unknown++;

            results.push({
              tracking,
              carrier: 'UPS',
              status: data.status,
              statusDescription: data.statusDescription,
              deliveredAt: data.actualDelivery,
              estimatedDelivery: data.estimatedDelivery,
              service: data.service,
              origin: `${data.origin.city}, ${data.origin.state}`,
              destination: `${data.destination.city}, ${data.destination.state}`,
              isException: data.isException,
              poNumber: data.poNumber,
              shipperReference: data.shipperReference,
              shipperName: data.shipperName
            });
            continue;
          }
        }
        
        if (carrier === 'fedex' && isFedExConfigured()) {
          const data = await trackFedEx(tracking);
          if (data) {
            const isDelivered = data.statusDescription?.toLowerCase().includes('delivered');
            const isInTransit = data.statusDescription?.toLowerCase().includes('transit') || 
                               data.statusDescription?.toLowerCase().includes('on the way');
            
            if (isDelivered) stats.delivered++;
            else if (data.isException) stats.exceptions++;
            else if (isInTransit) stats.inTransit++;
            else stats.unknown++;

            results.push({
              tracking,
              carrier: 'FedEx',
              status: data.status,
              statusDescription: data.statusDescription,
              deliveredAt: data.actualDelivery,
              estimatedDelivery: data.estimatedDelivery,
              service: data.service,
              origin: `${data.origin.city}, ${data.origin.state || data.origin.country}`,
              destination: `${data.destination.city}, ${data.destination.state}`,
              signedBy: data.signedBy,
              isException: data.isException,
              poNumber: data.poNumber,
              shipperReference: data.shipperReference,
              shipperName: data.shipperName
            });
            continue;
          }
        }

        // Couldn't track
        stats.unknown++;
        results.push({
          tracking,
          carrier: carrier === 'unknown' ? 'Unknown' : carrier.toUpperCase(),
          status: 'NOT_FOUND',
          statusDescription: 'Unable to track - carrier not configured or tracking not found',
          isException: false,
          error: carrier === 'unknown' ? 'Unknown carrier format' : 'Tracking not found'
        });

      } catch (err) {
        stats.unknown++;
        results.push({
          tracking,
          carrier: carrier.toUpperCase(),
          status: 'ERROR',
          statusDescription: 'Error tracking package',
          isException: false,
          error: String(err)
        });
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      results
    });

  } catch (error) {
    console.error('Batch tracking error:', error);
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}

// GET endpoint for documentation
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/batch-track',
    method: 'POST',
    description: 'Track multiple packages at once',
    body: {
      trackingNumbers: ['1Z...', '789...'],
      // OR
      trackingList: '1Z...\n789...\n...'
    },
    limits: {
      maxPerRequest: 50
    },
    response: {
      stats: { total: 0, delivered: 0, inTransit: 0, exceptions: 0, unknown: 0 },
      results: []
    }
  });
}

