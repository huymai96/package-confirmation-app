import { NextRequest, NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// This can take a while, increase timeout
export const maxDuration = 60;

const INDEX_BLOB_NAME = 'tracking-index.json';
const API_KEY = process.env.LABEL_API_KEY || 'promos-label-2024';

interface IndexEntry {
  source: string;
  sourceType: 'sanmar' | 'ss' | 'customink' | 'inbound' | 'unknown';
  po: string;
  customer: string;
  department?: string;
  dueDate?: string;
  status?: string;
  shipperName?: string;
  referenceTokens?: string[];
  rawRow?: unknown[];
}

interface TrackingIndex {
  [tracking: string]: IndexEntry;
}

interface OrderInfo {
  department?: string;
  dueDate?: string;
  status?: string;
}

interface OrderIndex {
  [poDigits: string]: OrderInfo;
}

// Detect manifest type from filename
function detectManifestType(filename: string): {
  type: 'sanmar' | 'ss' | 'customink' | 'inbound' | 'unknown';
  trackingCols: number[];
  poCol: number;
  customerCol: number;
} {
  const lower = filename.toLowerCase();
  
  if (lower.includes('sanmar')) {
    return { type: 'sanmar', trackingCols: [11, 12], poCol: 4, customerCol: 2 };
  }
  if (lower.includes('s&s') || lower.includes('ss_') || lower.includes('ss-') || lower.includes('activewear')) {
    return { type: 'ss', trackingCols: [7], poCol: 2, customerCol: 1 };
  }
  if (lower.includes('customink') || lower.includes('orders')) {
    return { type: 'customink', trackingCols: [], poCol: 0, customerCol: -1 };
  }
  if (lower.includes('inbound') || lower.includes('quantumview')) {
    return { type: 'inbound', trackingCols: [0], poCol: 1, customerCol: 4 };
  }
  
  return { type: 'unknown', trackingCols: [], poCol: -1, customerCol: -1 };
}

// Fetch and parse manifest file
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

// Parse CSV to 2D array
function parseCSVToArray(text: string): unknown[][] {
  const lines = text.trim().split('\n');
  const rows: unknown[][] = [];
  
  for (const line of lines) {
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

// Fetch CustomInk orders and build order index
async function buildOrderIndex(blobs: { pathname: string; url: string }[]): Promise<OrderIndex> {
  const orderIndex: OrderIndex = {};
  
  const orderBlobs = blobs.filter(b => {
    const filename = b.pathname.replace('manifests/', '').toLowerCase();
    return filename.includes('customink') || filename.includes('orders');
  });
  
  for (const blob of orderBlobs) {
    try {
      const response = await fetch(blob.url);
      if (!response.ok) continue;
      
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const orders = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];
      
      for (const order of orders) {
        const orderIdKey = Object.keys(order).find(k => 
          k.toLowerCase().includes('order') || k.toLowerCase() === 'id'
        );
        const deptKey = Object.keys(order).find(k => 
          k.toLowerCase().includes('vendor') || k.toLowerCase().includes('department')
        );
        const dueKey = Object.keys(order).find(k => k.toLowerCase().includes('due'));
        const statusKey = Object.keys(order).find(k => k.toLowerCase().includes('status'));
        
        if (orderIdKey) {
          const orderId = String(order[orderIdKey] || '');
          // Extract digits for indexing (e.g., "1234567A" -> "1234567")
          const digits = orderId.replace(/[^0-9]/g, '');
          if (digits && digits.length >= 6) {
            orderIndex[digits] = {
              department: deptKey ? String(order[deptKey] || '') : undefined,
              dueDate: dueKey ? String(order[dueKey] || '') : undefined,
              status: statusKey ? String(order[statusKey] || '') : undefined
            };
          }
        }
      }
    } catch (error) {
      console.error(`Error processing orders from ${blob.pathname}:`, error);
    }
  }
  
  return orderIndex;
}

function normalizeTracking(tracking: unknown): string {
  return String(tracking || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// Build the complete tracking index
async function buildTrackingIndex(): Promise<{ index: TrackingIndex; stats: object }> {
  const index: TrackingIndex = {};
  const stats = {
    totalManifests: 0,
    sanmarCount: 0,
    ssCount: 0,
    inboundCount: 0,
    totalTrackings: 0,
    buildTime: 0
  };
  
  const startTime = Date.now();
  
  try {
    const { blobs } = await list({ prefix: 'manifests/' });
    stats.totalManifests = blobs.length;
    
    // Build order index first for enrichment
    const orderIndex = await buildOrderIndex(blobs);
    console.log(`Order index built with ${Object.keys(orderIndex).length} orders`);
    
    // Process each manifest
    for (const blob of blobs) {
      const filename = blob.pathname.replace('manifests/', '');
      const config = detectManifestType(filename);
      
      // Skip order files (already processed)
      if (config.type === 'customink' || config.type === 'unknown') continue;
      
      console.log(`Processing ${filename} (${config.type})...`);
      const rows = await fetchManifest(blob.url, filename);
      
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!Array.isArray(row)) continue;
        
        // Get tracking numbers from configured columns
        const trackings: string[] = [];
        
        if (config.type === 'inbound') {
          // For inbound, search all columns for tracking-like values
          for (let col = 0; col < Math.min(row.length, 10); col++) {
            const val = normalizeTracking(row[col]);
            if (val.length >= 10 && (val.startsWith('1Z') || val.match(/^\d{12,}/))) {
              trackings.push(val);
            }
          }
        } else {
          // For sanmar/ss, use configured columns
          for (const colIdx of config.trackingCols) {
            if (colIdx < row.length) {
              const val = normalizeTracking(row[colIdx]);
              if (val.length >= 10) {
                trackings.push(val);
              }
            }
          }
        }
        
        // Add each tracking to index
        for (const tracking of trackings) {
          if (index[tracking]) continue; // Skip duplicates (keep first)
          
          const po = String(row[config.poCol] || '');
          const customer = String(row[config.customerCol] || '');
          
          const entry: IndexEntry = {
            source: filename,
            sourceType: config.type,
            po: po,
            customer: customer
          };
          
          // Enrich with order info if we have a PO
          if (po) {
            const poDigits = po.replace(/[^0-9]/g, '');
            if (poDigits && orderIndex[poDigits]) {
              entry.department = orderIndex[poDigits].department;
              entry.dueDate = orderIndex[poDigits].dueDate;
              entry.status = orderIndex[poDigits].status;
            }
          }
          
          // Special handling for inbound
          if (config.type === 'inbound') {
            const refValue = String(row[1] || '');
            const shipperValue = String(row[4] || '');
            entry.shipperName = shipperValue;
            entry.referenceTokens = refValue.split('|').map(t => t.trim()).filter(t => t);
            
            // Try to find CI order from reference tokens
            for (const token of entry.referenceTokens) {
              const ciMatch = token.match(/(\d{7,10})[A-Za-z]/);
              if (ciMatch && orderIndex[ciMatch[1]]) {
                entry.department = orderIndex[ciMatch[1]].department;
                entry.dueDate = orderIndex[ciMatch[1]].dueDate;
                entry.status = orderIndex[ciMatch[1]].status;
                entry.po = ciMatch[1];
                break;
              }
            }
          }
          
          index[tracking] = entry;
          
          // Update stats
          if (config.type === 'sanmar') stats.sanmarCount++;
          else if (config.type === 'ss') stats.ssCount++;
          else if (config.type === 'inbound') stats.inboundCount++;
        }
      }
    }
    
    stats.totalTrackings = Object.keys(index).length;
    stats.buildTime = Date.now() - startTime;
    
    return { index, stats };
    
  } catch (error) {
    console.error('Error building index:', error);
    throw error;
  }
}

// POST - Build/rebuild the index
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  
  if (apiKey !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    console.log('Starting index build...');
    const { index, stats } = await buildTrackingIndex();
    
    // Save index to blob storage
    const indexJson = JSON.stringify(index);
    const blob = await put(INDEX_BLOB_NAME, indexJson, {
      access: 'public',
      contentType: 'application/json'
    });
    
    console.log('Index saved to blob storage');
    
    return NextResponse.json({
      success: true,
      message: 'Index built successfully',
      stats,
      indexUrl: blob.url,
      indexSize: indexJson.length
    });
    
  } catch (error) {
    console.error('Index build error:', error);
    return NextResponse.json({ 
      error: 'Failed to build index',
      details: String(error)
    }, { status: 500 });
  }
}

// GET - Check index status
export async function GET(request: NextRequest) {
  try {
    const { blobs } = await list();
    const indexBlob = blobs.find(b => b.pathname === INDEX_BLOB_NAME);
    
    if (indexBlob) {
      return NextResponse.json({
        exists: true,
        url: indexBlob.url,
        size: indexBlob.size,
        updatedAt: indexBlob.uploadedAt
      });
    } else {
      return NextResponse.json({
        exists: false,
        message: 'Index not built yet. POST to this endpoint to build it.'
      });
    }
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check index' }, { status: 500 });
  }
}

