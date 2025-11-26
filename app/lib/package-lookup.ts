import fs from 'fs';
import path from 'path';

const SYNC_FOLDER = 'C:\\auto sync inbound';

// File paths
const SCAN_LOG_PATH = path.join(SYNC_FOLDER, 'scan_log.csv');
const INBOUND_CSV_PATH = path.join(SYNC_FOLDER, 'inbound.csv');

// Outbound files
const OUTBOUND_FILES = [
  { path: path.join(SYNC_FOLDER, 'UPSSHIPPINGSTATION2(in).csv'), location: 'FB2', station: 'Station 2', carrier: 'UPS' },
  { path: path.join(SYNC_FOLDER, 'FB2SWShippingStation2(in).csv'), location: 'FB2', station: 'SW Station 2', carrier: 'UPS' },
  { path: path.join(SYNC_FOLDER, 'FB2ShippingStation1(in).csv'), location: 'FB2', station: 'Station 1', carrier: 'UPS' },
  { path: path.join(SYNC_FOLDER, 'SWShippingStation1(in).csv'), location: 'FB1', station: 'SW Station 1', carrier: 'UPS' },
];

export interface PackageResult {
  found: boolean;
  type: 'inbound' | 'outbound' | 'both' | 'none';
  tracking: string;
  
  // Inbound info
  inbound?: {
    scanned: boolean;
    scanTimestamp?: string;
    scanStatus?: string;
    poNumber?: string;
    customer?: string;
    upsStatus?: string;
    shipper?: string;
  };
  
  // Outbound info
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
    carrier?: string;
  };
  
  message: string;
}

// Parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Search in scan_log.csv (Inbound scans)
function searchScanLog(query: string): { found: boolean; tracking?: string; po?: string; customer?: string; timestamp?: string; status?: string } {
  try {
    if (!fs.existsSync(SCAN_LOG_PATH)) return { found: false };
    
    const content = fs.readFileSync(SCAN_LOG_PATH, 'utf-8');
    const lines = content.trim().split('\n').slice(1);
    const queryLower = query.toLowerCase();
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length >= 6) {
        const tracking = parts[1]?.toLowerCase() || '';
        const po = parts[2]?.toLowerCase() || '';
        
        if (tracking.includes(queryLower) || po.includes(queryLower)) {
          if (parts[5] === 'Not Found') continue;
          
          return {
            found: true,
            tracking: parts[1],
            po: parts[2],
            customer: parts[3],
            timestamp: parts[0],
            status: parts[5]
          };
        }
      }
    }
  } catch (error) {
    console.error('Error searching scan log:', error);
  }
  return { found: false };
}

// Search in inbound.csv (UPS manifest)
function searchInbound(query: string): { found: boolean; tracking?: string; po?: string; status?: string; shipper?: string } {
  try {
    if (!fs.existsSync(INBOUND_CSV_PATH)) return { found: false };
    
    const content = fs.readFileSync(INBOUND_CSV_PATH, 'utf-8');
    const lines = content.trim().split('\n').slice(1);
    const queryLower = query.toLowerCase();
    
    for (const line of lines) {
      const parts = parseCSVLine(line);
      if (parts.length >= 5) {
        const tracking = parts[0]?.toLowerCase() || '';
        const refs = parts[1]?.toLowerCase() || '';
        
        if (tracking.includes(queryLower) || refs.includes(queryLower)) {
          return {
            found: true,
            tracking: parts[0],
            po: parts[1]?.split('|')[0],
            status: parts[2],
            shipper: parts[4]
          };
        }
      }
    }
  } catch (error) {
    console.error('Error searching inbound:', error);
  }
  return { found: false };
}

// Search in outbound files
function searchOutbound(query: string): { found: boolean; recipient?: string; address?: string; city?: string; state?: string; zip?: string; service?: string; reference?: string; tracking?: string; location?: string; station?: string; carrier?: string } {
  const queryLower = query.toLowerCase();
  
  for (const file of OUTBOUND_FILES) {
    try {
      if (!fs.existsSync(file.path)) continue;
      
      const content = fs.readFileSync(file.path, 'utf-8');
      const lines = content.trim().split('\n');
      
      for (const line of lines) {
        const parts = parseCSVLine(line);
        if (parts.length >= 10) {
          // Tracking is usually the last non-empty column
          const tracking = parts[parts.length - 1]?.toLowerCase() || parts[12]?.toLowerCase() || '';
          const reference = parts[10]?.toLowerCase() || '';
          const reference2 = parts[11]?.toLowerCase() || '';
          
          if (tracking.includes(queryLower) || reference.includes(queryLower) || reference2.includes(queryLower)) {
            return {
              found: true,
              recipient: parts[0],
              address: parts[2],
              city: parts[7] || parts[6],
              state: parts[8] || parts[7],
              zip: parts[6] || parts[5],
              service: parts[9] || parts[8],
              reference: `${parts[10] || ''} ${parts[11] || ''}`.trim(),
              tracking: parts[parts.length - 1] || parts[12],
              location: file.location,
              station: file.station,
              carrier: file.carrier
            };
          }
        }
      }
    } catch (error) {
      console.error(`Error searching ${file.path}:`, error);
    }
  }
  
  return { found: false };
}

export function lookupPackage(query: string): PackageResult {
  if (!query || query.trim().length < 3) {
    return {
      found: false,
      type: 'none',
      tracking: query,
      message: 'Please enter at least 3 characters'
    };
  }

  const cleanQuery = query.trim();
  
  // Search all sources
  const scanResult = searchScanLog(cleanQuery);
  const inboundResult = searchInbound(cleanQuery);
  const outboundResult = searchOutbound(cleanQuery);
  
  // Determine result type
  const hasInbound = scanResult.found || inboundResult.found;
  const hasOutbound = outboundResult.found;
  
  let type: 'inbound' | 'outbound' | 'both' | 'none' = 'none';
  if (hasInbound && hasOutbound) type = 'both';
  else if (hasInbound) type = 'inbound';
  else if (hasOutbound) type = 'outbound';
  
  // Build result
  const result: PackageResult = {
    found: hasInbound || hasOutbound,
    type,
    tracking: cleanQuery,
    message: ''
  };
  
  // Add inbound info
  if (hasInbound) {
    result.inbound = {
      scanned: scanResult.found,
      scanTimestamp: scanResult.timestamp,
      scanStatus: scanResult.status,
      poNumber: scanResult.po || inboundResult.po,
      customer: scanResult.customer,
      upsStatus: inboundResult.status,
      shipper: inboundResult.shipper
    };
  }
  
  // Add outbound info
  if (hasOutbound) {
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
      station: outboundResult.station,
      carrier: outboundResult.carrier
    };
    result.tracking = outboundResult.tracking || cleanQuery;
  }
  
  // Generate message
  if (type === 'both') {
    result.message = '📥📤 Found in BOTH Inbound & Outbound';
  } else if (type === 'inbound') {
    if (scanResult.found) {
      result.message = `📥 INBOUND - Received on ${scanResult.timestamp}`;
    } else if (inboundResult.status === 'Delivered') {
      result.message = '📥 INBOUND - UPS Delivered but NOT SCANNED';
    } else {
      result.message = `📥 INBOUND - UPS Status: ${inboundResult.status}`;
    }
  } else if (type === 'outbound') {
    result.message = `📤 OUTBOUND - Shipped from ${outboundResult.location} (${outboundResult.station})`;
  } else {
    result.message = `❌ NOT FOUND - No record of "${cleanQuery}"`;
  }
  
  return result;
}

// Get recent scans
export function getRecentScans(limit: number = 20): Array<{ tracking: string; po: string; timestamp: string; status: string }> {
  try {
    if (!fs.existsSync(SCAN_LOG_PATH)) return [];
    
    const content = fs.readFileSync(SCAN_LOG_PATH, 'utf-8');
    const lines = content.trim().split('\n').slice(1);
    const results: Array<{ tracking: string; po: string; timestamp: string; status: string }> = [];
    const seen = new Set<string>();
    
    for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
      const parts = parseCSVLine(lines[i]);
      if (parts.length >= 6 && parts[5] !== 'Not Found') {
        const tracking = parts[1];
        if (!seen.has(tracking)) {
          seen.add(tracking);
          results.push({
            tracking,
            po: parts[2],
            timestamp: parts[0],
            status: parts[5]
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error getting recent scans:', error);
    return [];
  }
}

// Get recent outbound shipments
export function getRecentOutbound(limit: number = 20): Array<{ tracking: string; recipient: string; location: string; service: string }> {
  const results: Array<{ tracking: string; recipient: string; location: string; service: string }> = [];
  const seen = new Set<string>();
  
  for (const file of OUTBOUND_FILES) {
    try {
      if (!fs.existsSync(file.path)) continue;
      
      const content = fs.readFileSync(file.path, 'utf-8');
      const lines = content.trim().split('\n');
      
      // Get last N lines from each file
      for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length >= 10) {
          const tracking = parts[parts.length - 1] || parts[12];
          if (tracking && !seen.has(tracking) && tracking.length > 5) {
            seen.add(tracking);
            results.push({
              tracking,
              recipient: parts[0],
              location: file.location,
              service: parts[9] || parts[8] || 'Ground'
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error reading ${file.path}:`, error);
    }
  }
  
  return results.slice(0, limit);
}

// Get stats
export function getStats() {
  let inboundTotal = 0;
  let outboundTotal = 0;
  
  try {
    if (fs.existsSync(SCAN_LOG_PATH)) {
      const content = fs.readFileSync(SCAN_LOG_PATH, 'utf-8');
      inboundTotal = content.trim().split('\n').length - 1;
    }
  } catch (e) {}
  
  for (const file of OUTBOUND_FILES) {
    try {
      if (fs.existsSync(file.path)) {
        const content = fs.readFileSync(file.path, 'utf-8');
        outboundTotal += content.trim().split('\n').length;
      }
    } catch (e) {}
  }
  
  return { inboundTotal, outboundTotal };
}
