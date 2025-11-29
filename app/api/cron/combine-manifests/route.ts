import { NextRequest, NextResponse } from 'next/server';
import { list, put, del } from '@vercel/blob';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 seconds for Pro plan

const CRON_SECRET = process.env.CRON_SECRET || 'promos-ink-cron-2024';

interface ManifestRow {
  [key: string]: unknown;
}

// Verify cron authorization
function verifyCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  // Vercel cron uses this header
  const vercelCron = request.headers.get('x-vercel-cron');
  
  // Allow if it's a Vercel cron request or has valid Bearer token
  if (vercelCron) return true;
  if (authHeader === `Bearer ${CRON_SECRET}`) return true;
  
  return false;
}

// Parse CSV text to array of objects
function parseCSV(text: string): ManifestRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Parse header row
  const headers = parseCSVLine(lines[0]);
  const rows: ManifestRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: ManifestRow = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }
  
  return rows;
}

// Parse a single CSV line handling quoted values
function parseCSVLine(line: string): string[] {
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
  
  return values;
}

// Normalize tracking number for deduplication
function normalizeTracking(tracking: unknown): string {
  return String(tracking || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

// Get tracking column name from headers
function findTrackingColumn(headers: string[]): string | null {
  for (const h of headers) {
    if (h.toLowerCase().includes('tracking')) return h;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  // Verify authorization
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  console.log('='.repeat(60));
  console.log('CRON: Combine Manifests Started');
  console.log('='.repeat(60));
  
  const stats = {
    ssFilesProcessed: 0,
    ssRowsCombined: 0,
    ssTrackingsUnique: 0,
    sanmarFilesProcessed: 0,
    sanmarRowsCombined: 0,
    sanmarTrackingsUnique: 0,
    errors: [] as string[],
    duration: 0
  };
  
  try {
    const { blobs } = await list({ prefix: 'manifests/' });
    console.log(`Found ${blobs.length} total blobs in manifests/`);
    
    // ==========================================
    // PROCESS S&S FILES
    // ==========================================
    console.log('\n--- Processing S&S Files ---');
    
    // Find all S&S daily files (not the combined file)
    const ssFiles = blobs.filter(b => {
      const filename = b.pathname.replace('manifests/', '').toLowerCase();
      return (filename.startsWith('s&s_') || filename.startsWith('ss_')) && 
             !filename.includes('combined') &&
             (filename.endsWith('.xlsx') || filename.endsWith('.xls'));
    }).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    console.log(`Found ${ssFiles.length} S&S daily files`);
    
    const ssRows: ManifestRow[] = [];
    const ssTrackingSeen = new Set<string>();
    let ssHeaders: string[] = [];
    
    for (const blob of ssFiles) {
      try {
        console.log(`  Processing: ${blob.pathname}`);
        const response = await fetch(blob.url);
        if (!response.ok) {
          stats.errors.push(`Failed to fetch ${blob.pathname}`);
          continue;
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // S&S files have header in row 2
        const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        
        if (allRows.length < 2) {
          console.log(`    Skipping - no data rows`);
          continue;
        }
        
        // Get headers from row 2 (index 1)
        const headers = (allRows[1] || []).map(h => String(h || ''));
        if (ssHeaders.length === 0) {
          ssHeaders = headers;
        }
        
        // Find tracking column
        const trackingCol = findTrackingColumn(headers);
        const trackingIdx = trackingCol ? headers.indexOf(trackingCol) : -1;
        
        // Process data rows (starting from row 3, index 2)
        let fileRowCount = 0;
        for (let i = 2; i < allRows.length; i++) {
          const rowArr = allRows[i] as unknown[];
          if (!rowArr || rowArr.length === 0) continue;
          
          // Create row object
          const row: ManifestRow = {};
          headers.forEach((h, idx) => {
            row[h] = rowArr[idx] || '';
          });
          
          // Deduplicate by tracking number
          if (trackingIdx >= 0) {
            const tracking = normalizeTracking(rowArr[trackingIdx]);
            if (tracking && ssTrackingSeen.has(tracking)) {
              continue; // Skip duplicate
            }
            if (tracking) {
              ssTrackingSeen.add(tracking);
            }
          }
          
          ssRows.push(row);
          fileRowCount++;
        }
        
        console.log(`    Added ${fileRowCount} rows`);
        stats.ssFilesProcessed++;
        
      } catch (error) {
        console.error(`  Error processing ${blob.pathname}:`, error);
        stats.errors.push(`Error processing ${blob.pathname}: ${String(error)}`);
      }
    }
    
    stats.ssRowsCombined = ssRows.length;
    stats.ssTrackingsUnique = ssTrackingSeen.size;
    
    // Write combined S&S file
    if (ssRows.length > 0 && ssHeaders.length > 0) {
      console.log(`\nWriting ss_combined.xlsx with ${ssRows.length} rows...`);
      
      // Create workbook with header in row 2 (S&S format)
      const wsData: unknown[][] = [];
      wsData.push([]); // Empty row 1
      wsData.push(ssHeaders); // Headers in row 2
      
      for (const row of ssRows) {
        const rowArr = ssHeaders.map(h => row[h] || '');
        wsData.push(rowArr);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      // Delete old combined file if exists
      const oldSsCombined = blobs.find(b => b.pathname === 'manifests/ss_combined.xlsx');
      if (oldSsCombined) {
        await del(oldSsCombined.url);
        console.log('  Deleted old ss_combined.xlsx');
      }
      
      // Upload new combined file
      await put('manifests/ss_combined.xlsx', xlsxBuffer, {
        access: 'public',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      console.log('  Uploaded new ss_combined.xlsx');
    }
    
    // ==========================================
    // PROCESS SANMAR FILES
    // ==========================================
    console.log('\n--- Processing Sanmar Files ---');
    
    // Find all Sanmar daily files (CSV or XLSX, not combined)
    const sanmarFiles = blobs.filter(b => {
      const filename = b.pathname.replace('manifests/', '').toLowerCase();
      return filename.startsWith('sanmar_') && 
             !filename.includes('combined') &&
             (filename.endsWith('.csv') || filename.endsWith('.xlsx'));
    }).sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    console.log(`Found ${sanmarFiles.length} Sanmar daily files`);
    
    const sanmarRows: ManifestRow[] = [];
    const sanmarTrackingSeen = new Set<string>();
    let sanmarHeaders: string[] = [];
    
    for (const blob of sanmarFiles) {
      try {
        console.log(`  Processing: ${blob.pathname}`);
        const response = await fetch(blob.url);
        if (!response.ok) {
          stats.errors.push(`Failed to fetch ${blob.pathname}`);
          continue;
        }
        
        let rows: ManifestRow[] = [];
        let headers: string[] = [];
        
        if (blob.pathname.endsWith('.csv')) {
          // Parse CSV
          const text = await response.text();
          
          // Validate CSV content
          if (!text.trim().startsWith('"') && !text.trim().startsWith('Deco')) {
            console.log(`    Skipping - appears corrupted`);
            continue;
          }
          
          rows = parseCSV(text);
          if (rows.length > 0) {
            headers = Object.keys(rows[0]);
          }
        } else {
          // Parse XLSX
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          rows = XLSX.utils.sheet_to_json(sheet) as ManifestRow[];
          if (rows.length > 0) {
            headers = Object.keys(rows[0]);
          }
        }
        
        if (sanmarHeaders.length === 0 && headers.length > 0) {
          sanmarHeaders = headers;
        }
        
        // Find tracking column
        const trackingCol = findTrackingColumn(headers);
        
        // Process rows
        let fileRowCount = 0;
        for (const row of rows) {
          // Deduplicate by tracking number
          if (trackingCol) {
            const tracking = normalizeTracking(row[trackingCol]);
            if (tracking && sanmarTrackingSeen.has(tracking)) {
              continue; // Skip duplicate
            }
            if (tracking) {
              sanmarTrackingSeen.add(tracking);
            }
          }
          
          sanmarRows.push(row);
          fileRowCount++;
        }
        
        console.log(`    Added ${fileRowCount} rows`);
        stats.sanmarFilesProcessed++;
        
      } catch (error) {
        console.error(`  Error processing ${blob.pathname}:`, error);
        stats.errors.push(`Error processing ${blob.pathname}: ${String(error)}`);
      }
    }
    
    stats.sanmarRowsCombined = sanmarRows.length;
    stats.sanmarTrackingsUnique = sanmarTrackingSeen.size;
    
    // Write combined Sanmar file (as XLSX for consistency)
    if (sanmarRows.length > 0 && sanmarHeaders.length > 0) {
      console.log(`\nWriting sanmar_combined.xlsx with ${sanmarRows.length} rows...`);
      
      // Create workbook with header in row 1 (Sanmar format)
      const wsData: unknown[][] = [];
      wsData.push(sanmarHeaders); // Headers in row 1
      
      for (const row of sanmarRows) {
        const rowArr = sanmarHeaders.map(h => row[h] || '');
        wsData.push(rowArr);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      // Delete old combined file if exists
      const oldSanmarCombined = blobs.find(b => b.pathname === 'manifests/sanmar_combined.xlsx');
      if (oldSanmarCombined) {
        await del(oldSanmarCombined.url);
        console.log('  Deleted old sanmar_combined.xlsx');
      }
      
      // Upload new combined file
      await put('manifests/sanmar_combined.xlsx', xlsxBuffer, {
        access: 'public',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      console.log('  Uploaded new sanmar_combined.xlsx');
    }
    
    stats.duration = Date.now() - startTime;
    
    console.log('\n' + '='.repeat(60));
    console.log('CRON: Combine Manifests Complete');
    console.log(`Duration: ${stats.duration}ms`);
    console.log('='.repeat(60));
    
    return NextResponse.json({
      success: true,
      message: 'Manifests combined successfully',
      stats
    });
    
  } catch (error) {
    console.error('Combine manifests error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to combine manifests',
      details: String(error),
      stats
    }, { status: 500 });
  }
}

// GET - Health check / info
export async function GET(request: NextRequest) {
  // Allow unauthenticated GET for health checks
  return NextResponse.json({
    endpoint: 'Combine Manifests Cron',
    description: 'Combines daily S&S and Sanmar manifest files into combined files',
    schedule: 'Every 15 minutes',
    method: 'POST with Authorization: Bearer <CRON_SECRET>',
    outputs: ['manifests/ss_combined.xlsx', 'manifests/sanmar_combined.xlsx']
  });
}


