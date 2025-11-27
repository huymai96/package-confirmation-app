import { NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

interface QVShipment {
  trackingNumber: string;
  shipperNumber: string;
  shipDate: string;
  service: string;
  weight: string;
  origin: {
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  destination: {
    city: string;
    state: string;
    country: string;
    postalCode: string;
    companyName?: string;
  };
  currentStatus?: string;
  lastActivity?: {
    date: string;
    time: string;
    location: string;
    description: string;
  };
}

// Helper to read Quantum View data from blob
async function getQVData(): Promise<{ shipments: Record<string, QVShipment> }> {
  try {
    const { blobs } = await list();
    const qvBlob = blobs.find(b => b.pathname === 'quantum-view-events.json');
    
    if (!qvBlob) return { shipments: {} };
    
    const response = await fetch(qvBlob.url);
    if (!response.ok) return { shipments: {} };
    
    return await response.json();
  } catch {
    return { shipments: {} };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const originZip = searchParams.get('originZip');
  const originCity = searchParams.get('originCity');
  const supplierName = searchParams.get('supplier');
  const status = searchParams.get('status');
  const arrivingToday = searchParams.get('arrivingToday');

  try {
    const data = await getQVData();
    const allShipments = Object.values(data.shipments || {});
    
    // Filter for inbound shipments (going to our warehouses in 75234)
    let inboundShipments = allShipments.filter(s => {
      const destZip = s.destination?.postalCode || '';
      return destZip === '75234' || destZip.startsWith('75234');
    });

    // Filter by origin zip code
    if (originZip) {
      inboundShipments = inboundShipments.filter(s => {
        const shipOriginZip = s.origin?.postalCode || '';
        return shipOriginZip.startsWith(originZip);
      });
    }

    // Filter by origin city
    if (originCity) {
      const cityLower = originCity.toLowerCase();
      inboundShipments = inboundShipments.filter(s => {
        const shipOriginCity = (s.origin?.city || '').toLowerCase();
        return shipOriginCity.includes(cityLower);
      });
    }

    // Filter by supplier/shipper name
    if (supplierName) {
      const supplierLower = supplierName.toLowerCase();
      inboundShipments = inboundShipments.filter(s => {
        const shipperName = (s.destination?.companyName || '').toLowerCase();
        return shipperName.includes(supplierLower);
      });
    }

    // Filter by status
    if (status) {
      const statusLower = status.toLowerCase();
      inboundShipments = inboundShipments.filter(s => {
        const shipStatus = (s.currentStatus || '').toLowerCase();
        return shipStatus.includes(statusLower);
      });
    }

    // Filter for arriving today
    if (arrivingToday === 'true') {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      inboundShipments = inboundShipments.filter(s => {
        const shipDate = s.shipDate || '';
        const lastActivityDate = s.lastActivity?.date || '';
        return shipDate.startsWith(today) || lastActivityDate.startsWith(today);
      });
    }

    // Group by origin for summary
    const byOrigin: Record<string, QVShipment[]> = {};
    for (const ship of inboundShipments) {
      const originKey = `${ship.origin?.city || 'Unknown'}, ${ship.origin?.state || ''} ${ship.origin?.postalCode || ''}`.trim();
      if (!byOrigin[originKey]) byOrigin[originKey] = [];
      byOrigin[originKey].push(ship);
    }

    return NextResponse.json({
      success: true,
      total: inboundShipments.length,
      filters: {
        originZip: originZip || 'all',
        originCity: originCity || 'all',
        supplier: supplierName || 'all',
        status: status || 'all'
      },
      byOrigin: Object.entries(byOrigin).map(([origin, ships]) => ({
        origin,
        count: ships.length,
        shipments: ships.map(s => ({
          tracking: s.trackingNumber,
          status: s.currentStatus,
          shipDate: s.shipDate,
          service: s.service,
          weight: s.weight,
          lastActivity: s.lastActivity
        }))
      })),
      shipments: inboundShipments.map(s => ({
        tracking: s.trackingNumber,
        origin: `${s.origin?.city || ''}, ${s.origin?.state || ''} ${s.origin?.postalCode || ''}`,
        status: s.currentStatus,
        shipDate: s.shipDate,
        service: s.service,
        lastActivity: s.lastActivity?.description
      }))
    });

  } catch (error) {
    console.error('Inbound search error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

