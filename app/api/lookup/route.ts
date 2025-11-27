import { NextResponse } from 'next/server';
import { trackPackage, isConfigured as isUPSConfigured } from '@/app/lib/ups-integration';

// Check if running in cloud mode (Vercel) or local mode
const IS_CLOUD = process.env.BLOB_READ_WRITE_TOKEN ? true : false;

// Dynamic imports based on environment
async function getLocalFunctions() {
  const module = await import('@/app/lib/package-lookup');
  return module;
}

async function getCloudFunctions() {
  const module = await import('@/app/lib/cloud-storage');
  return module;
}

// Check if tracking number is UPS format
function isUPSTracking(tracking: string): boolean {
  // UPS tracking numbers start with 1Z and are 18 characters
  return /^1Z[A-Z0-9]{16}$/i.test(tracking.trim());
}

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const recent = searchParams.get('recent');
  const recentOutbound = searchParams.get('recentOutbound');
  const stats = searchParams.get('stats');
  
  try {
    if (IS_CLOUD) {
      // Cloud mode - use Vercel Blob
      const cloud = await getCloudFunctions();
      
      if (stats === 'true') {
        const data = await cloud.getStats();
        return NextResponse.json(data || { inboundTotal: 0, outboundTotal: 0 });
      }
      
      if (recent === 'true') {
        const data = await cloud.getRecentInbound();
        return NextResponse.json(data);
      }
      
      if (recentOutbound === 'true') {
        const data = await cloud.getRecentOutbound();
        return NextResponse.json(data);
      }
      
      if (query) {
        // Get local data first
        const result = await cloud.lookupPackage(query);
        
        // If it's a UPS tracking number, also get live UPS data
        if (isUPSTracking(query) && isUPSConfigured()) {
          try {
            const upsData = await trackPackage(query.trim());
            if (upsData) {
              // Merge UPS live data with our local data
              return NextResponse.json({
                ...result,
                upsLive: {
                  status: upsData.statusDescription,
                  deliveredAt: upsData.actualDelivery,
                  estimatedDelivery: upsData.estimatedDelivery,
                  location: upsData.events[0]?.location,
                  isException: upsData.isException,
                  exceptionReason: upsData.exceptionReason,
                  weight: upsData.weight,
                  service: upsData.service,
                  events: upsData.events.slice(0, 5) // Last 5 events
                }
              });
            }
          } catch (upsError) {
            console.error('UPS tracking error:', upsError);
            // Return result without UPS data if UPS fails
          }
        }
        
        return NextResponse.json(result);
      }
    } else {
      // Local mode - use local files
      const local = await getLocalFunctions();
      
      if (stats === 'true') {
        return NextResponse.json(local.getStats());
      }
      
      if (recent === 'true') {
        return NextResponse.json(local.getRecentScans(20));
      }
      
      if (recentOutbound === 'true') {
        return NextResponse.json(local.getRecentOutbound(20));
      }
      
      if (query) {
        return NextResponse.json(local.lookupPackage(query));
      }
    }
    
    return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
  } catch (error) {
    console.error('Lookup error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
