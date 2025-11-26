import { NextResponse } from 'next/server';
import { readScanLog, getStats } from '@/app/lib/csv-reader';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statsOnly = searchParams.get('stats') === 'true';
    
    if (statsOnly) {
      const stats = getStats();
      return NextResponse.json(stats);
    }
    
    const records = readScanLog();
    return NextResponse.json(records);
  } catch (error) {
    console.error('Error in GET /api/packages:', error);
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
}
