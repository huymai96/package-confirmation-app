import { NextResponse } from 'next/server';
import { 
  trackPackage, 
  trackMultiplePackages, 
  getConfigStatus, 
  isFedExTracking 
} from '@/app/lib/fedex-integration';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const tracking = searchParams.get('tracking');

  try {
    // Check configuration status
    if (action === 'status') {
      const config = getConfigStatus();
      return NextResponse.json({
        ...config,
        message: config.configured 
          ? 'FedEx integration is configured and ready'
          : 'FedEx credentials not configured'
      });
    }

    // Track a single package
    if (action === 'track' && tracking) {
      const config = getConfigStatus();
      if (!config.configured) {
        return NextResponse.json({
          error: 'FedEx not configured',
          ...config
        }, { status: 500 });
      }

      // Verify it looks like a FedEx tracking number
      if (!isFedExTracking(tracking)) {
        return NextResponse.json({
          error: 'Invalid FedEx tracking number format',
          tracking
        }, { status: 400 });
      }

      const result = await trackPackage(tracking);
      
      if (!result) {
        return NextResponse.json({
          found: false,
          tracking,
          message: 'Package not found or tracking unavailable'
        });
      }

      return NextResponse.json({
        found: true,
        ...result
      });
    }

    // Default response - show available actions
    return NextResponse.json({
      endpoint: '/api/fedex',
      actions: {
        'GET ?action=status': 'Check FedEx integration status',
        'GET ?action=track&tracking=XXXX': 'Track a FedEx package'
      }
    });

  } catch (error) {
    console.error('FedEx API error:', error);
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}

// POST endpoint for batch tracking
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trackingNumbers = body.trackingNumbers;

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return NextResponse.json({
        error: 'trackingNumbers array is required'
      }, { status: 400 });
    }

    const config = getConfigStatus();
    if (!config.configured) {
      return NextResponse.json({
        error: 'FedEx not configured',
        ...config
      }, { status: 500 });
    }

    const results = await trackMultiplePackages(trackingNumbers);

    return NextResponse.json({
      success: true,
      requested: trackingNumbers.length,
      found: results.length,
      packages: results
    });

  } catch (error) {
    console.error('FedEx batch API error:', error);
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}

