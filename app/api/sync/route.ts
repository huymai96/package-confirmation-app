import { NextResponse } from 'next/server';
import { 
  storeInboundScans, 
  storeOutboundShipments, 
  updateStats,
  type InboundScan,
  type OutboundShipment
} from '@/app/lib/cloud-storage';

// Secret key to protect the sync endpoint
const SYNC_SECRET = process.env.SYNC_SECRET || 'your-sync-secret-key';

export async function POST(request: Request) {
  try {
    // Verify secret key
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${SYNC_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const { type, data } = body;
    
    if (type === 'inbound') {
      const scans: InboundScan[] = data;
      const result = await storeInboundScans(scans);
      return NextResponse.json(result);
    }
    
    if (type === 'outbound') {
      const shipments: OutboundShipment[] = data;
      const result = await storeOutboundShipments(shipments);
      return NextResponse.json(result);
    }
    
    if (type === 'stats') {
      const { inboundCount, outboundCount } = data;
      await updateStats(inboundCount, outboundCount);
      return NextResponse.json({ success: true });
    }
    
    if (type === 'full') {
      // Full sync - inbound, outbound, and stats
      const { inbound, outbound } = data;
      
      const [inboundResult, outboundResult] = await Promise.all([
        storeInboundScans(inbound || []),
        storeOutboundShipments(outbound || [])
      ]);
      
      await updateStats(
        inbound?.length || 0,
        outbound?.length || 0
      );
      
      return NextResponse.json({
        success: true,
        inbound: inboundResult,
        outbound: outboundResult
      });
    }
    
    return NextResponse.json({ error: 'Invalid sync type' }, { status: 400 });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

