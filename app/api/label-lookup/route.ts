import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// API key for label print GUI authentication
const LABEL_API_KEY = process.env.LABEL_API_KEY || 'promos-label-2024';

interface ManifestConfig {
  type: 'sanmar' | 'ss' | 'customink' | 'inbound' | 'unknown';
  trackingCols: number[];
  poCol: number;
  customerCol: number;
}

interface PackageInfo {
  found: boolean;
  tracking: string;
  source?: string;
  sourceType?: 'sanmar' | 'ss' | 'customink' | 'inbound' | 'unknown';
  po?: string;
  customer?: string;
  // CustomInk order fields
  department?: string;
  dueDate?: string;
  status?: string;
  // Inbound fields
  shipperName?: string;
  referenceTokens?: string[];
  // Fast Platform fields
  mustShipBy?: string;
  processes?: string;
  // Raw data for client-side processing
  rawRow?: unknown[];
  rawData?: Record<string, unknown>;
}

// Detect manifest type from filename
function detectManifestType(filename: string): ManifestConfig {
  const lower = filename.toLowerCase();
  
  if (lower.includes('sanmar') || lower.includes('san_mar') || lower.includes('san-mar')) {
    return { type: 'sanmar', trackingCols: [11, 12], poCol: 4, customerCol: 2 };
  }
  if (lower.includes('s&s') || lower.includes('ss_') || lower.includes('ss-') || 
      lower.includes('activewear') || lower.includes('sns')) {
    return { type: 'ss', trackingCols: [7], poCol: 2, customerCol: 1 };
  }
  if (lower.includes('customink') || lower.includes('custom_ink') || lower.includes('orders')) {
    return { type: 'customink', trackingCols: [], poCol: 0, customerCol: -1 };
  }
  if (lower.includes('inbound') || lower.includes('quantumview') || lower.includes('qv')) {
    return { type: 'inbound', trackingCols: [0], poCol: 1, customerCol: 4 };
  }
  
  return { type: 'unknown', trackingCols: [], poCol: -1, customerCol: -1 };
}

// Helper to fetch and parse manifest file
async function fetchManifest(url: string, filename: string): Promise<unknown[][]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const arrayBuffer = await response.arrayBuffer();
    
    if (filename.endsWith('.csv') || filename.endsWith('.txt')) {
      const text = new TextDecoder().decode(arrayBuffer);
      return parseCSVToArray(text);
    } else {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    }
  } catch (error) {
    console.error(`Error fetching manifest ${filename}:`, error);
    return [];
  }
}

// Parse CSV to 2D array (preserving column indices)
function parseCSVToArray(text: string): unknown[][] {
  const lines = text.trim().split('\n');
  const rows: unknown[][] = [];
  
  for (const line of lines) {
    // Handle quoted CSV fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    rows.push(values);
  }
  
  return rows;
}

// Fetch and parse CustomInk orders specifically
async function fetchCustomInkOrders(url: string, filename: string): Promise<Record<string, unknown>[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet);
  } catch (error) {
    console.error(`Error fetching CustomInk orders ${filename}:`, error);
    return [];
  }
}

function normalizeTracking(tracking: string): string {
  return tracking.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function normalizeForComparison(value: unknown): string {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// Search sanmar/ss manifests for tracking
async function searchSupplierManifests(tracking: string): Promise<PackageInfo | null> {
  const normalizedTracking = normalizeTracking(tracking);
  
  try {
    const { blobs } = await list({ prefix: 'manifests/' });
    
    // Sort by upload date, newest first
    const sortedBlobs = blobs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    
    for (const blob of sortedBlobs) {
      const filename = blob.pathname.replace('manifests/', '');
      const config = detectManifestType(filename);
      
      // Skip non-supplier manifests
      if (config.type !== 'sanmar' && config.type !== 'ss') continue;
      
      const rows = await fetchManifest(blob.url, filename);
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;
        
        // Check tracking columns
        for (const colIdx of config.trackingCols) {
          if (colIdx < row.length) {
            const cellValue = normalizeForComparison(row[colIdx]);
            if (cellValue === normalizedTracking) {
              return {
                found: true,
                tracking: tracking,
                source: filename,
                sourceType: config.type,
                po: String(row[config.poCol] || ''),
                customer: String(row[config.customerCol] || ''),
                rawRow: row
              };
            }
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching supplier manifests:', error);
    return null;
  }
}

// Search inbound manifest for tracking
async function searchInboundManifest(tracking: string): Promise<PackageInfo | null> {
  const normalizedTracking = normalizeTracking(tracking);
  
  try {
    const { blobs } = await list({ prefix: 'manifests/' });
    
    // Find inbound manifests
    const inboundBlobs = blobs.filter(b => {
      const filename = b.pathname.replace('manifests/', '').toLowerCase();
      return filename.includes('inbound') || filename.includes('quantumview');
    }).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    for (const blob of inboundBlobs) {
      const filename = blob.pathname.replace('manifests/', '');
      const rows = await fetchManifest(blob.url, filename);
      
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        
        // Search all columns for tracking match
        for (let colIdx = 0; colIdx < row.length; colIdx++) {
          const cellValue = normalizeForComparison(row[colIdx]);
          if (cellValue === normalizedTracking) {
            // Column B (index 1) = Reference/PO tokens
            // Column E (index 4) = Shipper
            const refValue = String(row[1] || '');
            const shipperValue = String(row[4] || '');
            
            // Parse reference tokens (split by |)
            const refTokens = refValue.split('|').map(t => t.trim()).filter(t => t);
            
            return {
              found: true,
              tracking: tracking,
              source: filename,
              sourceType: 'inbound',
              po: refValue,
              customer: shipperValue.split(',')[0].trim(),
              shipperName: shipperValue,
              referenceTokens: refTokens,
              rawRow: row
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching inbound manifest:', error);
    return null;
  }
}

// Search CustomInk orders for a PO number
async function searchCustomInkOrders(poNumber: string): Promise<{
  department?: string;
  dueDate?: string;
  status?: string;
} | null> {
  if (!poNumber) return null;
  
  // Extract digits from PO (e.g., "1234567A" -> "1234567")
  const poDigits = poNumber.replace(/[^0-9]/g, '');
  if (!poDigits) return null;
  
  try {
    const { blobs } = await list({ prefix: 'manifests/' });
    
    // Find CustomInk orders files
    const orderBlobs = blobs.filter(b => {
      const filename = b.pathname.replace('manifests/', '').toLowerCase();
      return filename.includes('customink') || filename.includes('orders');
    }).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    for (const blob of orderBlobs) {
      const filename = blob.pathname.replace('manifests/', '');
      const orders = await fetchCustomInkOrders(blob.url, filename);
      
      for (const order of orders) {
        // Find order ID column
        const orderIdKey = Object.keys(order).find(k => 
          k.toLowerCase().includes('order') || k.toLowerCase() === 'id'
        );
        
        if (orderIdKey) {
          const orderId = String(order[orderIdKey] || '').replace(/[^0-9A-Za-z]/g, '');
          // Match if PO digits are in order ID
          if (orderId.includes(poDigits) || poDigits.includes(orderId.replace(/[^0-9]/g, ''))) {
            // Find department/vendor column
            const deptKey = Object.keys(order).find(k => 
              k.toLowerCase().includes('vendor') || k.toLowerCase().includes('department')
            );
            // Find due date column
            const dueKey = Object.keys(order).find(k => 
              k.toLowerCase().includes('due')
            );
            // Find status column
            const statusKey = Object.keys(order).find(k => 
              k.toLowerCase().includes('status')
            );
            
            return {
              department: deptKey ? String(order[deptKey] || '') : undefined,
              dueDate: dueKey ? String(order[dueKey] || '') : undefined,
              status: statusKey ? String(order[statusKey] || '') : undefined
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching CustomInk orders:', error);
    return null;
  }
}

// Search Fast Platform decorator report
async function searchFastPlatform(poNumber: string): Promise<{
  mustShipBy?: string;
  processes?: string;
} | null> {
  if (!poNumber) return null;
  
  const normalizedPO = poNumber.replace(/\s+/g, '').toUpperCase();
  
  try {
    const { blobs } = await list({ prefix: 'manifests/' });
    
    // Find decorator report files
    const reportBlobs = blobs.filter(b => {
      const filename = b.pathname.replace('manifests/', '').toLowerCase();
      return filename.includes('decorator') || filename.includes('fast_platform') || filename.includes('fastplatform');
    }).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    for (const blob of reportBlobs) {
      const filename = blob.pathname.replace('manifests/', '');
      const rows = await fetchManifest(blob.url, filename);
      
      if (rows.length < 2) continue;
      
      // First row is headers
      const headers = rows[0] as string[];
      const poIdIdx = headers.findIndex(h => String(h).toLowerCase().trim() === 'po id');
      const poNumIdx = headers.findIndex(h => ['po num', 'po number', 'po #'].includes(String(h).toLowerCase().trim()));
      const mustShipIdx = headers.findIndex(h => String(h).toLowerCase().includes('must ship'));
      const processesIdx = headers.findIndex(h => String(h).toLowerCase().includes('processes'));
      
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as string[];
        
        // Check PO ID and PO Num columns
        const checkCols = [poIdIdx, poNumIdx].filter(idx => idx >= 0);
        for (const colIdx of checkCols) {
          const cellValue = String(row[colIdx] || '').replace(/\s+/g, '').toUpperCase();
          if (cellValue.includes(normalizedPO) || normalizedPO.includes(cellValue)) {
            return {
              mustShipBy: mustShipIdx >= 0 ? String(row[mustShipIdx] || '') : undefined,
              processes: processesIdx >= 0 ? String(row[processesIdx] || '') : undefined
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching Fast Platform:', error);
    return null;
  }
}

// Main search function - searches all sources
async function searchAllSources(tracking: string): Promise<PackageInfo> {
  // 1. Search supplier manifests (Sanmar, S&S)
  const supplierResult = await searchSupplierManifests(tracking);
  if (supplierResult) {
    // Enrich with CustomInk order data if we have a PO
    if (supplierResult.po) {
      const orderInfo = await searchCustomInkOrders(supplierResult.po);
      if (orderInfo) {
        supplierResult.department = orderInfo.department;
        supplierResult.dueDate = orderInfo.dueDate;
        supplierResult.status = orderInfo.status;
      }
      
      // Check Fast Platform if customer is Fast Platform
      if (supplierResult.customer?.toLowerCase().includes('fast platform') ||
          supplierResult.customer?.toLowerCase().includes('eretailing')) {
        const fpInfo = await searchFastPlatform(supplierResult.po);
        if (fpInfo) {
          supplierResult.mustShipBy = fpInfo.mustShipBy;
          supplierResult.processes = fpInfo.processes;
        }
      }
    }
    return supplierResult;
  }
  
  // 2. Search inbound manifest
  const inboundResult = await searchInboundManifest(tracking);
  if (inboundResult) {
    // Try to enrich with CustomInk order data using reference tokens
    if (inboundResult.referenceTokens) {
      for (const token of inboundResult.referenceTokens) {
        // Look for CI-like patterns (8-10 digits followed by a letter)
        const ciMatch = token.match(/(\d{7,10})([A-Za-z])/);
        if (ciMatch) {
          const poDigits = ciMatch[1];
          const orderInfo = await searchCustomInkOrders(poDigits);
          if (orderInfo?.department) {
            inboundResult.department = orderInfo.department;
            inboundResult.dueDate = orderInfo.dueDate;
            inboundResult.status = orderInfo.status;
            inboundResult.po = poDigits;
            break;
          }
        }
      }
    }
    return inboundResult;
  }
  
  // 3. Not found
  return {
    found: false,
    tracking: tracking
  };
}

// GET - Main lookup endpoint
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const tracking = searchParams.get('tracking');
  const po = searchParams.get('po');
  const apiKey = request.headers.get('x-api-key') || searchParams.get('key');

  // Allow info without auth
  if (!action || action === 'info') {
    return NextResponse.json({
      endpoint: 'Promos Ink Label Print - Cloud API',
      version: '2.0',
      actions: {
        lookup: 'GET ?action=lookup&tracking=1Z...',
        orderInfo: 'GET ?action=orderInfo&po=1234567',
        fastPlatform: 'GET ?action=fastPlatform&po=...',
        manifests: 'GET ?action=manifests',
        health: 'GET ?action=health'
      },
      authentication: 'Include x-api-key header or ?key= parameter'
    });
  }

  // Health check without auth
  if (action === 'health') {
    return NextResponse.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      version: '2.0'
    });
  }

  // Auth required for other actions
  if (apiKey !== LABEL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // List manifests
  if (action === 'manifests') {
    try {
      const { blobs } = await list({ prefix: 'manifests/' });
      
      return NextResponse.json({
        manifests: blobs.map(b => ({
          name: b.pathname.replace('manifests/', ''),
          type: detectManifestType(b.pathname.replace('manifests/', '')).type,
          url: b.url,
          size: b.size,
          uploadedAt: b.uploadedAt
        }))
      });
    } catch (error) {
      return NextResponse.json({ error: 'Failed to list manifests' }, { status: 500 });
    }
  }

  // Lookup tracking
  if (action === 'lookup') {
    if (!tracking) {
      return NextResponse.json({ error: 'Missing tracking parameter' }, { status: 400 });
    }

    const result = await searchAllSources(tracking);
    return NextResponse.json(result);
  }

  // Order info lookup (for PO enrichment)
  if (action === 'orderInfo') {
    if (!po) {
      return NextResponse.json({ error: 'Missing po parameter' }, { status: 400 });
    }

    const orderInfo = await searchCustomInkOrders(po);
    return NextResponse.json({
      found: !!orderInfo?.department,
      po: po,
      ...orderInfo
    });
  }

  // Fast Platform lookup
  if (action === 'fastPlatform') {
    if (!po) {
      return NextResponse.json({ error: 'Missing po parameter' }, { status: 400 });
    }

    const fpInfo = await searchFastPlatform(po);
    return NextResponse.json({
      found: !!fpInfo,
      po: po,
      ...fpInfo
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// POST - Batch lookup
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  
  if (apiKey !== LABEL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const trackingNumbers: string[] = body.trackingNumbers || body.tracking || [];

    if (!Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return NextResponse.json({ error: 'Missing trackingNumbers array' }, { status: 400 });
    }

    // Limit batch size
    const limitedNumbers = trackingNumbers.slice(0, 50);
    
    const results: PackageInfo[] = [];
    
    for (const tracking of limitedNumbers) {
      const result = await searchAllSources(tracking);
      results.push(result);
    }

    return NextResponse.json({
      total: limitedNumbers.length,
      found: results.filter(r => r.found).length,
      results
    });

  } catch (error) {
    console.error('Batch lookup error:', error);
    return NextResponse.json({ error: 'Failed to process batch lookup' }, { status: 500 });
  }
}
