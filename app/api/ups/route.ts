import { NextResponse } from 'next/server';
import { 
  trackPackage, 
  getQuantumViewData, 
  getArrivingToday,
  getExceptions,
  isConfigured,
  getConfigStatus
} from '@/app/lib/ups-integration';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const tracking = searchParams.get('tracking');

  try {
    // Check configuration status
    if (action === 'status') {
      return NextResponse.json(getConfigStatus());
    }

    // Check if UPS is configured
    if (!isConfigured()) {
      return NextResponse.json({
        error: 'UPS integration not configured',
        message: 'Please add UPS_CLIENT_ID and UPS_CLIENT_SECRET to environment variables'
      }, { status: 503 });
    }

    // Track a specific package
    if (action === 'track' && tracking) {
      const result = await trackPackage(tracking);
      if (!result) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 });
      }
      return NextResponse.json(result);
    }

    // Get all Quantum View data
    if (action === 'quantum-view') {
      const shipments = await getQuantumViewData();
      return NextResponse.json({
        count: shipments.length,
        shipments
      });
    }

    // Get arriving today
    if (action === 'arriving-today') {
      const shipments = await getArrivingToday();
      return NextResponse.json({
        count: shipments.length,
        shipments
      });
    }

    // Get exceptions
    if (action === 'exceptions') {
      const shipments = await getExceptions();
      return NextResponse.json({
        count: shipments.length,
        shipments
      });
    }

    return NextResponse.json({ 
      error: 'Invalid action',
      validActions: ['status', 'track', 'quantum-view', 'arriving-today', 'exceptions']
    }, { status: 400 });

  } catch (error) {
    console.error('UPS API error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

