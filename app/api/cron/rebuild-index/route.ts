import { NextRequest, NextResponse } from 'next/server';
import { list, put } from '@vercel/blob';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds for Pro plan

const CRON_SECRET = process.env.CRON_SECRET || 'promos-ink-cron-2024';
const INDEX_BLOB_NAME = 'tracking-index.json';

interface IndexEntry {
  source: string;
  sourceType: 'sanmar' | 'ss' | 'customink' | 'inbound' | 'unknown';
  po: string;
  customer: string;
  department?: string;
  dueDate?: string;
  status?: string;
  pipelineFlag?: string;
  shipperName?: string;
  referenceTokens?: string[];
}

interface TrackingIndex {
  [tracking: string]: IndexEntry;
}

interface OrderInfo {
  department?: string;
  dueDate?: string;
  status?: string;
  pipelineFlag?: string;
}

interface OrderIndex {
  [poDigits: string]: OrderInfo;
}

// Verify cron authorization
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const vercelCron = request.headers.get('x-vercel-cron');
  
  if (vercelCron) return true;
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  
  return false;
}

// Parse CSV text to 2D array
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

// Normalize tracking number
function normalizeTracking(tracking: unknown): string {
  return String(tracking || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// Find column index by name pattern
function findColumnIndex(headers: string[], patterns: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const lower = headers[i].toLowerCase();
    for (const pattern of patterns) {
      if (lower.includes(pattern)) return i;
    }
  }
  return -1;
}

// Build order index from CustomInk files
async function buildOrderIndex(blobs: { pathname: string; url: string }[]): Promise<OrderIndex> {
  const orderIndex: OrderIndex = {};
  
  const orderBlobs = blobs.filter(b => {
    const filename = b.pathname.replace('manifests/', '').toLowerCase();
    return filename.includes('customink') || filename.includes('orders');
  });
  
  console.log(`Building order index from ${orderBlobs.length} CustomInk files...`);
  
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
          const digits = orderId.replace(/[^0-9]/g, '');
          
          if (digits && digits.length >= 6) {
            const status = statusKey ? String(order[statusKey] || '') : '';
            const statusLower = status.toLowerCase();
            
            let pipelineFlag = '';
            if (statusLower.includes('on hold')) {
              pipelineFlag = 'On Hold';
            } else if (statusLower.includes('pipeline') || statusLower.includes('pending')) {
              pipelineFlag = 'Pipelined';
            }
            
            // Format due date
            let dueDate = dueKey ? String(order[dueKey] || '') : '';
            if (dueDate && dueDate !== 'nan') {
              try {
                const dt = new Date(dueDate);
                if (!isNaN(dt.getTime())) {
                  dueDate = dt.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric' 
                  });
                }
              } catch {
                // Keep original
              }
            }
            
            orderIndex[digits] = {
              department: deptKey ? String(order[deptKey] || '') : undefined,
              dueDate: dueDate || undefined,
              status: status || undefined,
              pipelineFlag: pipelineFlag || undefined
            };
          }
        }
      }
      
      console.log(`  ${blob.pathname}: ${Object.keys(orderIndex).length} orders indexed`);
      
    } catch (error) {
      console.error(`Error processing orders from ${blob.pathname}:`, error);
    }
  }
  
  return orderIndex;
}

// Build the complete tracking index
async function buildTrackingIndex(): Promise<{ index: TrackingIndex; stats: object }> {
  const index: TrackingIndex = {};
  const stats = {
    totalManifests: 0,
    sanmarCount: 0,
    ssCount: 0,
    inboundCount: 0,
    custominkOrders: 0,
    enrichedCount: 0,
    totalTrackings: 0,
    buildTime: 0
  };
  
  const startTime = Date.now();
  
  const { blobs } = await list({ prefix: 'manifests/' });
  stats.totalManifests = blobs.length;
  
  // Build order index first for enrichment
  const orderIndex = await buildOrderIndex(blobs);
  stats.custominkOrders = Object.keys(orderIndex).length;
  
  // Process combined files first (most complete data)
  const combinedFiles = blobs.filter(b => b.pathname.includes('_combined'));
  console.log(`Processing ${combinedFiles.length} combined files...`);
  
  for (const blob of combinedFiles) {
    try {
      const filename = blob.pathname.replace('manifests/', '');
      const isSS = filename.toLowerCase().includes('ss_combined');
      const isSanmar = filename.toLowerCase().includes('sanmar_combined');
      
      console.log(`  Processing: ${filename}`);
      
      const response = await fetch(blob.url);
      if (!response.ok) continue;
      
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
      
      // Determine header row (S&S has header in row 2)
      const headerRowIdx = isSS ? 1 : 0;
      const headers = (allRows[headerRowIdx] || []).map(h => String(h || ''));
      
      // Find columns
      const trackingIdx = findColumnIndex(headers, ['tracking']);
      const poIdx = findColumnIndex(headers, ['customer po', 'po']);
      const customerIdx = findColumnIndex(headers, ['customer name', 'customer']);
      
      if (trackingIdx === -1) {
        console.log(`    No tracking column found`);
        continue;
      }
      
      // Process data rows
      const dataStartIdx = isSS ? 2 : 1;
      let count = 0;
      
      for (let i = dataStartIdx; i < allRows.length; i++) {
        const row = allRows[i] as unknown[];
        if (!row || row.length === 0) continue;
        
        const trackingRaw = row[trackingIdx];
        const tracking = normalizeTracking(trackingRaw);
        
        if (tracking.length < 10) continue;
        if (index[tracking]) continue; // Skip duplicates
        
        const po = poIdx >= 0 ? String(row[poIdx] || '') : '';
        const customer = customerIdx >= 0 ? String(row[customerIdx] || '') : '';
        
        const entry: IndexEntry = {
          source: isSS ? 'ss' : 'sanmar',
          sourceType: isSS ? 'ss' : 'sanmar',
          po: po,
          customer: customer
        };
        
        // Enrich with order info
        if (po) {
          const poDigits = po.replace(/[^0-9]/g, '');
          if (poDigits && orderIndex[poDigits]) {
            entry.department = orderIndex[poDigits].department;
            entry.dueDate = orderIndex[poDigits].dueDate;
            entry.status = orderIndex[poDigits].status;
            entry.pipelineFlag = orderIndex[poDigits].pipelineFlag;
            stats.enrichedCount++;
          }
        }
        
        index[tracking] = entry;
        count++;
        
        if (isSS) stats.ssCount++;
        else if (isSanmar) stats.sanmarCount++;
      }
      
      console.log(`    Added ${count} tracking numbers`);
      
    } catch (error) {
      console.error(`Error processing ${blob.pathname}:`, error);
    }
  }
  
  // Process daily files (for any not in combined)
  const dailyFiles = blobs.filter(b => {
    const filename = b.pathname.replace('manifests/', '').toLowerCase();
    return !filename.includes('combined') && 
           !filename.includes('customink') &&
           (filename.startsWith('s&s_') || filename.startsWith('ss_') || 
            filename.startsWith('sanmar_') || filename.startsWith('inbound'));
  });
  
  console.log(`Processing ${dailyFiles.length} daily files...`);
  
  for (const blob of dailyFiles) {
    try {
      const filename = blob.pathname.replace('manifests/', '').toLowerCase();
      const isSS = filename.startsWith('s&s_') || filename.startsWith('ss_');
      const isSanmar = filename.startsWith('sanmar_');
      const isInbound = filename.startsWith('inbound');
      
      const response = await fetch(blob.url);
      if (!response.ok) continue;
      
      let rows: unknown[][];
      let headers: string[];
      let dataStartIdx = 0;
      
      if (filename.endsWith('.csv')) {
        const text = await response.text();
        // Validate CSV
        if (!text.trim().startsWith('"') && !text.trim().startsWith('Deco') && !text.trim().startsWith('Track')) {
          continue; // Skip corrupted
        }
        rows = parseCSVToArray(text);
        headers = (rows[0] || []).map(h => String(h || ''));
        dataStartIdx = 1;
      } else {
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        
        // S&S has header in row 2
        const headerRowIdx = isSS ? 1 : 0;
        headers = (rows[headerRowIdx] || []).map(h => String(h || ''));
        dataStartIdx = isSS ? 2 : 1;
      }
      
      // Find columns
      const trackingIdx = findColumnIndex(headers, ['tracking']);
      const poIdx = findColumnIndex(headers, ['customer po', 'po', 'reference']);
      const customerIdx = findColumnIndex(headers, ['customer name', 'customer', 'shipper']);
      
      if (trackingIdx === -1) continue;
      
      let count = 0;
      for (let i = dataStartIdx; i < rows.length; i++) {
        const row = rows[i] as unknown[];
        if (!row || row.length === 0) continue;
        
        const tracking = normalizeTracking(row[trackingIdx]);
        if (tracking.length < 10) continue;
        if (index[tracking]) continue; // Skip if already in index
        
        const po = poIdx >= 0 ? String(row[poIdx] || '') : '';
        const customer = customerIdx >= 0 ? String(row[customerIdx] || '') : '';
        
        const sourceType = isSS ? 'ss' : isSanmar ? 'sanmar' : isInbound ? 'inbound' : 'unknown';
        
        const entry: IndexEntry = {
          source: sourceType,
          sourceType: sourceType as IndexEntry['sourceType'],
          po: po,
          customer: customer
        };
        
        // Enrich with order info
        if (po) {
          const poDigits = po.replace(/[^0-9]/g, '');
          if (poDigits && orderIndex[poDigits]) {
            entry.department = orderIndex[poDigits].department;
            entry.dueDate = orderIndex[poDigits].dueDate;
            entry.status = orderIndex[poDigits].status;
            entry.pipelineFlag = orderIndex[poDigits].pipelineFlag;
            stats.enrichedCount++;
          }
        }
        
        index[tracking] = entry;
        count++;
        
        if (isSS) stats.ssCount++;
        else if (isSanmar) stats.sanmarCount++;
        else if (isInbound) stats.inboundCount++;
      }
      
      if (count > 0) {
        console.log(`    ${filename}: +${count} new trackings`);
      }
      
    } catch (error) {
      console.error(`Error processing daily file:`, error);
    }
  }
  
  stats.totalTrackings = Object.keys(index).length;
  stats.buildTime = Date.now() - startTime;
  
  return { index, stats };
}

export async function POST(request: NextRequest) {
  // Verify authorization
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('='.repeat(60));
  console.log('CRON: Rebuild Index Started');
  console.log('='.repeat(60));
  
  try {
    const { index, stats } = await buildTrackingIndex();
    
    // Save index to blob storage
    const indexJson = JSON.stringify(index);
    const blob = await put(INDEX_BLOB_NAME, indexJson, {
      access: 'public',
      contentType: 'application/json'
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('CRON: Rebuild Index Complete');
    console.log(`Total trackings: ${Object.keys(index).length}`);
    console.log('='.repeat(60));
    
    return NextResponse.json({
      success: true,
      message: 'Index rebuilt successfully',
      stats,
      indexUrl: blob.url,
      indexSize: indexJson.length
    });
    
  } catch (error) {
    console.error('Index rebuild error:', error);
    return NextResponse.json({ 
      error: 'Failed to rebuild index',
      details: String(error)
    }, { status: 500 });
  }
}

// GET - Health check / info
export async function GET(request: NextRequest) {
  try {
    const { blobs } = await list();
    const indexBlob = blobs.find(b => b.pathname === INDEX_BLOB_NAME);
    
    return NextResponse.json({
      endpoint: 'Rebuild Index Cron',
      description: 'Rebuilds the tracking index from all manifest files',
      schedule: 'Every hour',
      method: 'POST with Authorization: Bearer <CRON_SECRET>',
      indexExists: !!indexBlob,
      indexSize: indexBlob?.size || 0,
      lastUpdated: indexBlob?.uploadedAt || null
    });
  } catch (error) {
    return NextResponse.json({ 
      endpoint: 'Rebuild Index Cron',
      error: 'Could not check index status' 
    });
  }
}


