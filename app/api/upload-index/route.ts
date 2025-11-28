import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

const API_KEY = process.env.LABEL_API_KEY || 'promos-label-2024';
const INDEX_BLOB_NAME = 'tracking-index.json';

// POST - Upload pre-built index
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  
  if (apiKey !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const index = body.index;
    
    if (!index || typeof index !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid index data' }, { status: 400 });
    }
    
    const trackingCount = Object.keys(index).length;
    console.log(`Uploading index with ${trackingCount} trackings...`);
    
    // Delete ALL old index files first
    const { blobs } = await list();
    const oldIndexes = blobs.filter(b => b.pathname === INDEX_BLOB_NAME || b.pathname.includes('tracking-index'));
    for (const oldBlob of oldIndexes) {
      console.log(`Deleting old index: ${oldBlob.pathname}`);
      await del(oldBlob.url);
    }
    
    // Save new index to blob storage
    const indexJson = JSON.stringify(index);
    const blob = await put(INDEX_BLOB_NAME, indexJson, {
      access: 'public',
      contentType: 'application/json'
    });
    
    console.log('Index uploaded successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Index uploaded successfully',
      trackingCount,
      indexUrl: blob.url,
      indexSize: indexJson.length,
      uploadedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Index upload error:', error);
    return NextResponse.json({ 
      error: 'Failed to upload index',
      details: String(error)
    }, { status: 500 });
  }
}

