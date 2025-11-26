import { NextResponse } from 'next/server';
import { lookupPackage, getRecentScans, getRecentOutbound, getStats } from '@/app/lib/package-lookup';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const recent = searchParams.get('recent');
  const recentOutbound = searchParams.get('recentOutbound');
  const stats = searchParams.get('stats');
  
  if (stats === 'true') {
    return NextResponse.json(getStats());
  }
  
  if (recent === 'true') {
    return NextResponse.json(getRecentScans(20));
  }
  
  if (recentOutbound === 'true') {
    return NextResponse.json(getRecentOutbound(20));
  }
  
  if (!query) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }
  
  const result = lookupPackage(query);
  return NextResponse.json(result);
}
