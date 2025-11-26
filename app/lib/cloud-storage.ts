import { put, list, del } from '@vercel/blob';

// Blob file names
const BLOB_FILES = {
  INBOUND: 'inbound-scans.json',
  OUTBOUND: 'outbound-shipments.json',
  STATS: 'stats.json'
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

// Helper to get blob URL by name
async function getBlobUrl(filename: string): Promise<string | null> {
  try {
    const { blobs } = await list();
    const blob = blobs.find(b => b.pathname === filename);
    return blob?.url || null;
  } catch (error) {
    console.error('Error listing blobs:', error);
    return null;
  }
}

// Helper to read JSON from blob
async function readBlobJson<T>(filename: string): Promise<T | null> {
  try {
    const url = await getBlobUrl(filename);
    if (!url) return null;
    
    const response = await fetch(url);
    if (!response.ok) return null;
    
    return await response.json() as T;
  } catch (error) {
    console.error(`Error reading blob ${filename}:`, error);
    return null;
  }
}

// Helper to write JSON to blob
async function writeBlobJson(filename: string, data: unknown): Promise<boolean> {
  try {
    // Delete existing blob first
    const existingUrl = await getBlobUrl(filename);
    if (existingUrl) {
      await del(existingUrl);
    }
    
    // Write new blob
    const json = JSON.stringify(data);
    await put(filename, json, {
      access: 'public',
      contentType: 'application/json'
    });
    
    return true;
  } catch (error) {
    console.error(`Error writing blob ${filename}:`, error);
    return false;
  }
}

// Store inbound scans
export async function storeInboundScans(scans: InboundScan[]) {
  try {
    // Create lookup map
    const scanMap: Record<string, InboundScan> = {};
    for (const scan of scans) {
      if (scan.tracking) {
        scanMap[scan.tracking.toLowerCase()] = scan;
      }
      if (scan.po) {
        scanMap[`po:${scan.po.toLowerCase()}`] = scan;
      }
    }
    
    const data = {
      map: scanMap,
      recent: scans.slice(-50).reverse(),
      count: scans.length,
      lastUpdated: new Date().toISOString()
    };
    
    const success = await writeBlobJson(BLOB_FILES.INBOUND, data);
    return { success, count: scans.length };
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
    
    const data = {
      map: shipmentMap,
      recent: shipments.slice(-50).reverse(),
      count: shipments.length,
      lastUpdated: new Date().toISOString()
    };
    
    const success = await writeBlobJson(BLOB_FILES.OUTBOUND, data);
    return { success, count: shipments.length };
  } catch (error) {
    console.error('Error storing outbound shipments:', error);
    return { success: false, error: String(error) };
  }
}

// Update stats
export async function updateStats(inboundCount: number, outboundCount: number) {
  const data = {
    inboundTotal: inboundCount,
    outboundTotal: outboundCount,
    lastSync: new Date().toISOString()
  };
  await writeBlobJson(BLOB_FILES.STATS, data);
}

// Get stats
export async function getStats() {
  const stats = await readBlobJson<{ inboundTotal: number; outboundTotal: number; lastSync: string }>(BLOB_FILES.STATS);
  return stats || { inboundTotal: 0, outboundTotal: 0, lastSync: null };
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
  
  // Get data from Blob storage
  const [inboundData, outboundData] = await Promise.all([
    readBlobJson<{ map: Record<string, InboundScan>; recent: InboundScan[] }>(BLOB_FILES.INBOUND),
    readBlobJson<{ map: Record<string, OutboundShipment>; recent: OutboundShipment[] }>(BLOB_FILES.OUTBOUND)
  ]);
  
  const inboundMap = inboundData?.map || {};
  const outboundMap = outboundData?.map || {};
  
  // Search inbound
  let inboundResult: InboundScan | null = null;
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
  
  // Search outbound
  let outboundResult: OutboundShipment | null = null;
  outboundResult = outboundMap[cleanQuery] || null;
  
  if (!outboundResult) {
    for (const [key, ship] of Object.entries(outboundMap)) {
      if (key.includes(cleanQuery) || ship.tracking?.toLowerCase().includes(cleanQuery) || ship.reference?.toLowerCase().includes(cleanQuery)) {
        outboundResult = ship;
        break;
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
  const data = await readBlobJson<{ recent: InboundScan[] }>(BLOB_FILES.INBOUND);
  return data?.recent || [];
}

// Get recent outbound shipments
export async function getRecentOutbound() {
  const data = await readBlobJson<{ recent: OutboundShipment[] }>(BLOB_FILES.OUTBOUND);
  return data?.recent || [];
}
