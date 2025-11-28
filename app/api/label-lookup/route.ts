import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// API key for label print GUI authentication
const LABEL_API_KEY = process.env.LABEL_API_KEY || 'promos-label-2024';

interface PackageInfo {
  found: boolean;
  tracking: string;
  source?: string; // Which manifest it came from
  po?: string;
  customer?: string;
  description?: string;
  quantity?: number;
  weight?: string;
  carrier?: string;
  shipDate?: string;
  expectedDate?: string;
  shipperName?: string;
  rawData?: Record<string, unknown>;
}

// Helper to fetch and parse manifest file
async function fetchManifest(url: string, filename: string): Promise<Record<string, unknown>[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const arrayBuffer = await response.arrayBuffer();
    
    if (filename.endsWith('.csv')) {
      const text = new TextDecoder().decode(arrayBuffer);
      return parseCSV(text);
    } else {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(sheet);
    }
  } catch (error) {
    console.error(`Error fetching manifest ${filename}:`, error);
    return [];
  }
}

// Simple CSV parser
function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, unknown>[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// Common tracking number column names
const TRACKING_COLUMNS = [
  'tracking', 'tracking_number', 'trackingnumber', 'track', 'tracking #',
  'tracking no', 'trackingno', 'ups tracking', 'fedex tracking',
  'carrier tracking', 'shipment tracking', 'pro number', 'pro #',
  'package tracking', 'container', 'tracking id', 'trackingid'
];

// Common PO column names  
const PO_COLUMNS = [
  'po', 'po_number', 'ponumber', 'po #', 'po#', 'purchase order',
  'purchaseorder', 'order', 'order_number', 'ordernumber', 'order #',
  'customer po', 'customerpo', 'cust po', 'custpo', 'reference'
];

// Common customer column names
const CUSTOMER_COLUMNS = [
  'customer', 'customer_name', 'customername', 'ship to', 'shipto',
  'recipient', 'consignee', 'company', 'account', 'account_name',
  'buyer', 'client', 'name'
];

function findColumnValue(row: Record<string, unknown>, possibleColumns: string[]): string {
  for (const col of possibleColumns) {
    for (const key of Object.keys(row)) {
      if (key.toLowerCase().replace(/[^a-z0-9]/g, '') === col.replace(/[^a-z0-9]/g, '')) {
        const val = row[key];
        if (val !== null && val !== undefined && val !== '') {
          return String(val);
        }
      }
    }
  }
  return '';
}

function normalizeTracking(tracking: string): string {
  return tracking.replace(/\s+/g, '').toUpperCase();
}

// Search all manifests for a tracking number
async function searchManifests(tracking: string): Promise<PackageInfo | null> {
  const normalizedTracking = normalizeTracking(tracking);
  
  try {
    const { blobs } = await list();
    const manifestBlobs = blobs.filter(b => b.pathname.startsWith('manifests/'));
    
    for (const blob of manifestBlobs) {
      const filename = blob.pathname.replace('manifests/', '');
      const rows = await fetchManifest(blob.url, filename);
      
      for (const row of rows) {
        const rowTracking = normalizeTracking(findColumnValue(row, TRACKING_COLUMNS));
        
        if (rowTracking === normalizedTracking) {
          return {
            found: true,
            tracking: tracking,
            source: filename.replace(/\.(xlsx|xls|csv)$/i, ''),
            po: findColumnValue(row, PO_COLUMNS),
            customer: findColumnValue(row, CUSTOMER_COLUMNS),
            rawData: row
          };
        }
      }
    }
    
    // Also check inbound scans blob
    const inboundBlob = blobs.find(b => b.pathname === 'inbound-scans.json');
    if (inboundBlob) {
      const response = await fetch(inboundBlob.url);
      const inboundData = await response.json();
      
      for (const scan of inboundData) {
        if (normalizeTracking(scan.tracking) === normalizedTracking) {
          return {
            found: true,
            tracking: tracking,
            source: 'inbound-scans',
            po: scan.po || '',
            customer: scan.customer || '',
            rawData: scan
          };
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error searching manifests:', error);
    return null;
  }
}

// GET - Main lookup endpoint
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const tracking = searchParams.get('tracking');
  const apiKey = request.headers.get('x-api-key') || searchParams.get('key');

  // Allow info without auth
  if (!action || action === 'info') {
    return NextResponse.json({
      endpoint: 'Label Print GUI - Package Lookup API',
      version: '1.0',
      actions: {
        lookup: 'GET ?action=lookup&tracking=1Z...',
        manifests: 'GET ?action=manifests (list available manifests)',
        health: 'GET ?action=health (check API status)'
      },
      authentication: 'Include x-api-key header or ?key= parameter'
    });
  }

  // Health check without auth
  if (action === 'health') {
    return NextResponse.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString() 
    });
  }

  // Auth required for other actions
  if (apiKey !== LABEL_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // List manifests
  if (action === 'manifests') {
    try {
      const { blobs } = await list();
      const manifestBlobs = blobs.filter(b => b.pathname.startsWith('manifests/'));
      
      return NextResponse.json({
        manifests: manifestBlobs.map(b => ({
          name: b.pathname.replace('manifests/', ''),
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

    const result = await searchManifests(tracking);
    
    if (result) {
      return NextResponse.json(result);
    } else {
      return NextResponse.json({
        found: false,
        tracking: tracking,
        message: 'Package not found in any manifest'
      });
    }
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
    const limitedNumbers = trackingNumbers.slice(0, 100);
    
    const results: PackageInfo[] = [];
    
    for (const tracking of limitedNumbers) {
      const result = await searchManifests(tracking);
      results.push(result || {
        found: false,
        tracking: tracking
      });
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

