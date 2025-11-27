import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Convert array of objects to CSV string
function toCSV(data: any[], columns?: string[]): string {
  if (!data || data.length === 0) return '';
  
  // Get all unique keys if columns not specified
  const headers = columns || Array.from(new Set(data.flatMap(obj => Object.keys(obj))));
  
  // Create header row
  const headerRow = headers.map(h => `"${h}"`).join(',');
  
  // Create data rows
  const dataRows = data.map(obj => {
    return headers.map(header => {
      const value = obj[header];
      if (value === null || value === undefined) return '""';
      if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',');
  });
  
  return [headerRow, ...dataRows].join('\n');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data, filename, type } = body;

    if (!data || !Array.isArray(data)) {
      return NextResponse.json({
        error: 'data array is required'
      }, { status: 400 });
    }

    const exportType = type || 'csv';
    const exportFilename = filename || `export-${Date.now()}`;

    if (exportType === 'csv') {
      const csv = toCSV(data);
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${exportFilename}.csv"`
        }
      });
    }

    if (exportType === 'json') {
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${exportFilename}.json"`
        }
      });
    }

    return NextResponse.json({
      error: 'Invalid export type. Use csv or json'
    }, { status: 400 });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}

// GET endpoint - export recent data
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'csv';
  const source = searchParams.get('source'); // inbound, outbound, batch

  try {
    // Dynamic import for cloud storage
    const cloud = await import('@/app/lib/cloud-storage');
    
    let data: any[] = [];
    let filename = 'export';

    if (source === 'inbound') {
      data = await cloud.getRecentInbound(100);
      filename = `inbound-scans-${new Date().toISOString().split('T')[0]}`;
    } else if (source === 'outbound') {
      data = await cloud.getRecentOutbound(100);
      filename = `outbound-shipments-${new Date().toISOString().split('T')[0]}`;
    } else {
      return NextResponse.json({
        endpoint: '/api/export',
        usage: {
          'GET ?source=inbound&type=csv': 'Export recent inbound scans as CSV',
          'GET ?source=outbound&type=csv': 'Export recent outbound as CSV',
          'POST': 'Export custom data array'
        },
        postBody: {
          data: [{ tracking: '...', status: '...' }],
          filename: 'my-export',
          type: 'csv'
        }
      });
    }

    if (type === 'csv') {
      const csv = toCSV(data);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}.csv"`
        }
      });
    }

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}.json"`
      }
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}

