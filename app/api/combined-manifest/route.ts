import { NextRequest, NextResponse } from 'next/server';
import { put, list, head } from '@vercel/blob';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API_KEY = process.env.MANIFEST_UPLOAD_KEY || 'promos-ink-2024';

interface TrackingRecord {
  tracking: string;
  po: string;
  customer: string;
  source: string;
  shipDate: string;
  addedDate: string;
  style?: string;
  color?: string;
  size?: string;
  qty?: number;
}

// GET - Download combined manifest
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'xlsx';
  
  try {
    // Find the combined manifest
    const { blobs } = await list({ prefix: 'combined-manifest' });
    const combined = blobs.find(b => b.pathname === 'combined-manifest.json');
    
    if (!combined) {
      return NextResponse.json({ error: 'Combined manifest not found. Run rebuild first.' }, { status: 404 });
    }
    
    // Fetch the data
    const response = await fetch(combined.url);
    const data: TrackingRecord[] = await response.json();
    
    if (format === 'json') {
      return NextResponse.json({
        success: true,
        recordCount: data.length,
        data
      });
    }
    
    if (format === 'xlsx') {
      // Create Excel workbook
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Tracking Data');
      
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="combined-manifest.xlsx"'
        }
      });
    }
    
    if (format === 'csv') {
      // Create CSV
      const ws = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(ws);
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="combined-manifest.csv"'
        }
      });
    }
    
    return NextResponse.json({ error: 'Invalid format. Use json, xlsx, or csv' }, { status: 400 });
    
  } catch (error) {
    console.error('Error getting combined manifest:', error);
    return NextResponse.json({ error: 'Failed to get combined manifest', details: String(error) }, { status: 500 });
  }
}

// POST - Rebuild combined manifest (called by scheduled task)
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  
  if (apiKey !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const records: TrackingRecord[] = body.records || [];
    
    if (records.length === 0) {
      return NextResponse.json({ error: 'No records provided' }, { status: 400 });
    }
    
    // Filter to last 10 days
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const cutoffDate = tenDaysAgo.toISOString().split('T')[0];
    
    const filteredRecords = records.filter(r => {
      const recordDate = r.addedDate || r.shipDate || '';
      return recordDate >= cutoffDate;
    });
    
    // Upload to blob storage
    const blob = await put('combined-manifest.json', JSON.stringify(filteredRecords, null, 2), {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json'
    });
    
    return NextResponse.json({
      success: true,
      totalRecords: records.length,
      filteredRecords: filteredRecords.length,
      cutoffDate,
      url: blob.url
    });
    
  } catch (error) {
    console.error('Error rebuilding combined manifest:', error);
    return NextResponse.json({ error: 'Failed to rebuild', details: String(error) }, { status: 500 });
  }
}

