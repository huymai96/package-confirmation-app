import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_SUPPLIERS, findSupplierByZip, Supplier } from '../../lib/suppliers';
import { trackPackage } from '../../lib/ups-integration';
import { trackPackage as trackFedExPackage } from '../../lib/fedex-integration';
import * as cloud from '../../lib/cloud-storage';

export const dynamic = 'force-dynamic';

interface SupplierShipment {
  tracking: string;
  carrier: string;
  supplier: Supplier | null;
  status: string;
  statusDescription: string;
  origin: string;
  originZip: string;
  destination: string;
  shipDate?: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  service?: string;
  poNumber?: string;
  invoiceNumber?: string;
  shipperReference?: string;
  isException: boolean;
  events?: Array<{
    date: string;
    time: string;
    location: string;
    status: string;
    description: string;
  }>;
}

// Detect carrier from tracking number
function detectCarrier(tracking: string): 'UPS' | 'FedEx' | 'Unknown' {
  const t = tracking.trim().toUpperCase();
  if (t.startsWith('1Z') || (t.length === 18 && /^\d+$/.test(t))) return 'UPS';
  if (/^\d{12,22}$/.test(t)) return 'FedEx';
  return 'Unknown';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const supplierId = searchParams.get('supplierId');
  const originZip = searchParams.get('originZip');

  // List all suppliers
  if (action === 'list') {
    return NextResponse.json({
      suppliers: DEFAULT_SUPPLIERS,
      count: DEFAULT_SUPPLIERS.length
    });
  }

  // Get shipments from a specific supplier
  if (action === 'shipments' && supplierId) {
    const supplier = DEFAULT_SUPPLIERS.find(s => s.id === supplierId);
    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    try {
      // Get recent inbound scans and filter by supplier ZIP codes
      const recentInbound = await cloud.getRecentInbound();
      const supplierShipments: SupplierShipment[] = [];

      // For each supplier ZIP, check if we have shipments
      // We'll need to track packages to get origin info
      const trackingsSeen = new Set<string>();
      
      for (const scan of recentInbound.slice(0, 100)) { // Check last 100 scans
        if (trackingsSeen.has(scan.tracking)) continue;
        trackingsSeen.add(scan.tracking);

        const carrier = detectCarrier(scan.tracking);
        
        try {
          if (carrier === 'UPS') {
            const upsData = await trackPackage(scan.tracking);
            if (upsData && upsData.origin) {
              const originZipCode = upsData.origin.postalCode || '';
              if (supplier.zipCodes.includes(originZipCode)) {
                supplierShipments.push({
                  tracking: scan.tracking,
                  carrier: 'UPS',
                  supplier,
                  status: upsData.status || 'Unknown',
                  statusDescription: upsData.statusDescription || upsData.status || 'Unknown',
                  origin: `${upsData.origin.city || ''}, ${upsData.origin.state || ''}`,
                  originZip: originZipCode,
                  destination: upsData.destination 
                    ? `${upsData.destination.city || ''}, ${upsData.destination.state || ''}`
                    : 'Dallas, TX',
                  deliveredAt: upsData.actualDelivery,
                  estimatedDelivery: upsData.estimatedDelivery,
                  service: upsData.service,
                  poNumber: upsData.poNumber,
                  invoiceNumber: upsData.invoiceNumber,
                  shipperReference: upsData.shipperReference,
                  isException: upsData.isException || false,
                  events: upsData.events
                });
              }
            }
          } else if (carrier === 'FedEx') {
            const fedexData = await trackFedExPackage(scan.tracking);
            if (fedexData && fedexData.origin) {
              const originZipCode = fedexData.origin.postalCode || '';
              if (supplier.zipCodes.includes(originZipCode)) {
                supplierShipments.push({
                  tracking: scan.tracking,
                  carrier: 'FedEx',
                  supplier,
                  status: fedexData.status || 'Unknown',
                  statusDescription: fedexData.statusDescription || fedexData.status || 'Unknown',
                  origin: `${fedexData.origin.city || ''}, ${fedexData.origin.state || fedexData.origin.country || ''}`,
                  originZip: originZipCode,
                  destination: fedexData.destination 
                    ? `${fedexData.destination.city || ''}, ${fedexData.destination.state || ''}`
                    : 'Dallas, TX',
                  deliveredAt: fedexData.actualDelivery,
                  service: fedexData.service,
                  poNumber: fedexData.poNumber,
                  invoiceNumber: fedexData.invoiceNumber,
                  shipperReference: fedexData.shipperReference,
                  isException: fedexData.isException || false,
                  events: fedexData.events
                });
              }
            }
          }
        } catch (err) {
          // Skip failed tracking lookups
          console.error(`Error tracking ${scan.tracking}:`, err);
        }
      }

      return NextResponse.json({
        supplier,
        shipments: supplierShipments,
        count: supplierShipments.length
      });

    } catch (error) {
      console.error('Error fetching supplier shipments:', error);
      return NextResponse.json({ error: 'Failed to fetch shipments' }, { status: 500 });
    }
  }

  // Search by origin ZIP
  if (action === 'by-zip' && originZip) {
    const supplier = findSupplierByZip(originZip);
    return NextResponse.json({
      zip: originZip,
      supplier: supplier || null,
      isKnownSupplier: !!supplier
    });
  }

  return NextResponse.json({ 
    message: 'Supplier API',
    endpoints: [
      'GET ?action=list - List all suppliers',
      'GET ?action=shipments&supplierId=xxx - Get shipments from supplier',
      'GET ?action=by-zip&originZip=12345 - Check if ZIP is a known supplier'
    ]
  });
}

// Add a new supplier (for future use)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // For now, return the suppliers list - could implement storage later
    return NextResponse.json({
      message: 'Custom supplier management coming soon',
      currentSuppliers: DEFAULT_SUPPLIERS.length
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

