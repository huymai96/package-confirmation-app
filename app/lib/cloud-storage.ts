import { kv } from '@vercel/kv';

// Keys for storing data in Vercel KV
const KEYS = {
  INBOUND_SCANS: 'inbound_scans',
  OUTBOUND_SHIPMENTS: 'outbound_shipments',
  STATS: 'stats',
  LAST_SYNC: 'last_sync'
};

export interface InboundScan {
  tracking: string;
  po: string;
  customer: string;
  dueDate: string;
  timestamp: string;
  status: string;
}

export interface OutboundShipment {
  tracking: string;
  recipient: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  service: string;
  reference: string;
  location: string;
  station: string;
}

export interface PackageResult {
  found: boolean;
  type: 'inbound' | 'outbound' | 'both' | 'none';
  tracking: string;
  inbound?: {
    scanned: boolean;
    scanTimestamp?: string;
    scanStatus?: string;
    poNumber?: string;
    customer?: string;
  };
  outbound?: {
    found: boolean;
    recipient?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    service?: string;
    reference?: string;
    location?: string;
    station?: string;
  };
  message: string;
}

// Store inbound scans
export async function storeInboundScans(scans: InboundScan[]) {
  try {
    // Store as a hash map for quick lookup
    const scanMap: Record<string, InboundScan> = {};
    for (const scan of scans) {
      if (scan.tracking) {
        scanMap[scan.tracking.toLowerCase()] = scan;
      }
      if (scan.po) {
        scanMap[`po:${scan.po.toLowerCase()}`] = scan;
      }
    }
    
    await kv.set(KEYS.INBOUND_SCANS, scanMap);
    
    // Store recent scans list (last 50)
    const recent = scans.slice(-50).reverse();
    await kv.set('recent_inbound', recent);
    
    return { success: true, count: scans.length };
  } catch (error) {
    console.error('Error storing inbound scans:', error);
    return { success: false, error: String(error) };
  }
}

// Store outbound shipments
export async function storeOutboundShipments(shipments: OutboundShipment[]) {
  try {
    const shipmentMap: Record<string, OutboundShipment> = {};
    for (const ship of shipments) {
      if (ship.tracking) {
        shipmentMap[ship.tracking.toLowerCase()] = ship;
      }
    }
    
    await kv.set(KEYS.OUTBOUND_SHIPMENTS, shipmentMap);
    
    // Store recent shipments (last 50)
    const recent = shipments.slice(-50).reverse();
    await kv.set('recent_outbound', recent);
    
    return { success: true, count: shipments.length };
  } catch (error) {
    console.error('Error storing outbound shipments:', error);
    return { success: false, error: String(error) };
  }
}

// Update stats
export async function updateStats(inboundCount: number, outboundCount: number) {
  await kv.set(KEYS.STATS, { inboundTotal: inboundCount, outboundTotal: outboundCount });
  await kv.set(KEYS.LAST_SYNC, new Date().toISOString());
}

// Get stats
export async function getStats() {
  const stats = await kv.get<{ inboundTotal: number; outboundTotal: number }>(KEYS.STATS);
  const lastSync = await kv.get<string>(KEYS.LAST_SYNC);
  return { ...stats, lastSync };
}

// Search for a package
export async function lookupPackage(query: string): Promise<PackageResult> {
  if (!query || query.trim().length < 3) {
    return {
      found: false,
      type: 'none',
      tracking: query,
      message: 'Please enter at least 3 characters'
    };
  }

  const cleanQuery = query.trim().toLowerCase();
  
  // Get data from KV
  const [inboundMap, outboundMap] = await Promise.all([
    kv.get<Record<string, InboundScan>>(KEYS.INBOUND_SCANS),
    kv.get<Record<string, OutboundShipment>>(KEYS.OUTBOUND_SHIPMENTS)
  ]);
  
  // Search inbound
  let inboundResult: InboundScan | null = null;
  if (inboundMap) {
    // Direct match
    inboundResult = inboundMap[cleanQuery] || inboundMap[`po:${cleanQuery}`] || null;
    
    // Partial match if no direct match
    if (!inboundResult) {
      for (const [key, scan] of Object.entries(inboundMap)) {
        if (key.includes(cleanQuery) || scan.tracking?.toLowerCase().includes(cleanQuery) || scan.po?.toLowerCase().includes(cleanQuery)) {
          inboundResult = scan;
          break;
        }
      }
    }
  }
  
  // Search outbound
  let outboundResult: OutboundShipment | null = null;
  if (outboundMap) {
    outboundResult = outboundMap[cleanQuery] || null;
    
    if (!outboundResult) {
      for (const [key, ship] of Object.entries(outboundMap)) {
        if (key.includes(cleanQuery) || ship.tracking?.toLowerCase().includes(cleanQuery) || ship.reference?.toLowerCase().includes(cleanQuery)) {
          outboundResult = ship;
          break;
        }
      }
    }
  }
  
  // Build result
  const hasInbound = !!inboundResult;
  const hasOutbound = !!outboundResult;
  
  let type: 'inbound' | 'outbound' | 'both' | 'none' = 'none';
  if (hasInbound && hasOutbound) type = 'both';
  else if (hasInbound) type = 'inbound';
  else if (hasOutbound) type = 'outbound';
  
  const result: PackageResult = {
    found: hasInbound || hasOutbound,
    type,
    tracking: query,
    message: ''
  };
  
  if (inboundResult) {
    result.inbound = {
      scanned: true,
      scanTimestamp: inboundResult.timestamp,
      scanStatus: inboundResult.status,
      poNumber: inboundResult.po,
      customer: inboundResult.customer
    };
    result.tracking = inboundResult.tracking || query;
  }
  
  if (outboundResult) {
    result.outbound = {
      found: true,
      recipient: outboundResult.recipient,
      address: outboundResult.address,
      city: outboundResult.city,
      state: outboundResult.state,
      zip: outboundResult.zip,
      service: outboundResult.service,
      reference: outboundResult.reference,
      location: outboundResult.location,
      station: outboundResult.station
    };
    result.tracking = outboundResult.tracking || result.tracking;
  }
  
  // Generate message
  if (type === 'both') {
    result.message = '📥📤 Found in BOTH Inbound & Outbound';
  } else if (type === 'inbound') {
    result.message = `📥 INBOUND - Received on ${inboundResult?.timestamp}`;
  } else if (type === 'outbound') {
    result.message = `📤 OUTBOUND - Shipped from ${outboundResult?.location} (${outboundResult?.station})`;
  } else {
    result.message = `❌ NOT FOUND - No record of "${query}"`;
  }
  
  return result;
}

// Get recent inbound scans
export async function getRecentInbound() {
  return await kv.get<InboundScan[]>('recent_inbound') || [];
}

// Get recent outbound shipments
export async function getRecentOutbound() {
  return await kv.get<OutboundShipment[]>('recent_outbound') || [];
}

