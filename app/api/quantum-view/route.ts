import { NextResponse } from 'next/server';
import { getQuantumViewData, getArrivingToday, getExceptions, getConfigStatus } from '@/app/lib/ups-integration';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    // Check configuration
    const config = getConfigStatus();
    if (!config.configured) {
      return NextResponse.json({
        error: 'UPS not configured',
        ...config
      }, { status: 500 });
    }

    switch (action) {
      case 'status':
        return NextResponse.json({
          status: 'ready',
          ...config,
          message: 'Quantum View is configured and ready'
        });

      case 'all':
        // Get all Quantum View data
        const allShipments = await getQuantumViewData();
        const inbound = allShipments.filter(s => s.direction === 'inbound');
        const outbound = allShipments.filter(s => s.direction === 'outbound');
        
        return NextResponse.json({
          success: true,
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

      case 'inbound':
        // Get inbound shipments only
        const inboundData = await getQuantumViewData();
        const inboundOnly = inboundData.filter(s => s.direction === 'inbound');
        
        return NextResponse.json({
          success: true,
          count: inboundOnly.length,
          shipments: inboundOnly
        });

      case 'outbound':
        // Get outbound shipments only
        const outboundData = await getQuantumViewData();
        const outboundOnly = outboundData.filter(s => s.direction === 'outbound');
        
        return NextResponse.json({
          success: true,
          count: outboundOnly.length,
          shipments: outboundOnly
        });

      case 'arriving-today':
        // Get packages arriving today
        const arrivingToday = await getArrivingToday();
        
        return NextResponse.json({
          success: true,
          count: arrivingToday.length,
          date: new Date().toISOString().split('T')[0],
          shipments: arrivingToday
        });

      case 'exceptions':
        // Get exception shipments
        const exceptions = await getExceptions();
        
        return NextResponse.json({
          success: true,
          count: exceptions.length,
          shipments: exceptions
        });

      default:
        return NextResponse.json({
          endpoint: '/api/quantum-view',
          actions: {
            'status': 'Check Quantum View status',
            'all': 'Get all inbound + outbound + third party',
            'inbound': 'Get inbound shipments only',
            'outbound': 'Get outbound shipments only', 
            'arriving-today': 'Get packages arriving today',
            'exceptions': 'Get delayed/exception shipments'
          }
        });
    }
  } catch (error) {
    console.error('Quantum View API error:', error);
    return NextResponse.json({
      error: String(error),
      message: 'Failed to fetch Quantum View data'
    }, { status: 500 });
  }
}

