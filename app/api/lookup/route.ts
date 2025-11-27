import { NextResponse } from 'next/server';
import { trackPackage as trackUPS, isConfigured as isUPSConfigured } from '@/app/lib/ups-integration';
import { trackPackage as trackFedEx, isConfigured as isFedExConfigured, isFedExTracking } from '@/app/lib/fedex-integration';

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

// Detect carrier from tracking number
function detectCarrier(tracking: string): 'ups' | 'fedex' | 'unknown' {
  if (isUPSTracking(tracking)) return 'ups';
  if (isFedExTracking(tracking)) return 'fedex';
  return 'unknown';
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
        
        // Detect carrier and get live tracking data
        const carrier = detectCarrier(query);
        
        // If it's a UPS tracking number, get live UPS data
        if (carrier === 'ups' && isUPSConfigured()) {
          try {
            const upsData = await trackUPS(query.trim());
            if (upsData) {
              return NextResponse.json({
                ...result,
                carrier: 'UPS',
                upsLive: {
                  status: upsData.statusDescription,
                  deliveredAt: upsData.actualDelivery,
                  estimatedDelivery: upsData.estimatedDelivery,
                  location: upsData.events[0]?.location,
                  isException: upsData.isException,
                  exceptionReason: upsData.exceptionReason,
                  weight: upsData.weight,
                  service: upsData.service,
                  events: upsData.events.slice(0, 5),
                  // Reference fields
                  shipperReference: upsData.shipperReference,
                  poNumber: upsData.poNumber,
                  invoiceNumber: upsData.invoiceNumber,
                  shipperName: upsData.shipperName,
                  recipientName: upsData.recipientName
                }
              });
            }
          } catch (upsError) {
            console.error('UPS tracking error:', upsError);
          }
        }
        
        // If it's a FedEx tracking number, get live FedEx data
        if (carrier === 'fedex' && isFedExConfigured()) {
          try {
            const fedexData = await trackFedEx(query.trim());
            if (fedexData) {
              return NextResponse.json({
                ...result,
                carrier: 'FedEx',
                fedexLive: {
                  status: fedexData.statusDescription,
                  deliveredAt: fedexData.actualDelivery,
                  estimatedDelivery: fedexData.estimatedDelivery,
                  location: fedexData.events[0]?.location,
                  isException: fedexData.isException,
                  exceptionReason: fedexData.exceptionReason,
                  weight: fedexData.weight,
                  service: fedexData.service,
                  signedBy: fedexData.signedBy,
                  events: fedexData.events.slice(0, 5),
                  // Reference fields
                  shipperReference: fedexData.shipperReference,
                  poNumber: fedexData.poNumber,
                  invoiceNumber: fedexData.invoiceNumber,
                  shipperName: fedexData.shipperName,
                  recipientName: fedexData.recipientName,
                  customerReference: fedexData.customerReference,
                  // Origin/Destination
                  origin: fedexData.origin,
                  destination: fedexData.destination
                }
              });
            }
          } catch (fedexError) {
            console.error('FedEx tracking error:', fedexError);
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
