import { NextRequest, NextResponse } from 'next/server';
import { list } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// GET - Get tracking index statistics
export async function GET(request: NextRequest) {
  try {
    const { blobs } = await list();
    
    // Find the tracking index
    const indexBlob = blobs.find(b => b.pathname === 'tracking-index.json');
    
    // Find combined manifest files (stored as sanmar_combined.xlsx, ss_combined.xlsx)
    const combinedFiles = blobs.filter(b => 
      b.pathname.includes('combined')
    );
    
    // Get index data if exists
    let trackingCount = 0;
    let bySource: Record<string, number> = {};
    
    if (indexBlob) {
      try {
        const response = await fetch(indexBlob.url);
        if (response.ok) {
          const index = await response.json();
          trackingCount = Object.keys(index).length;
          
          // Count by source
          Object.values(index).forEach((entry: any) => {
            const source = entry.sourceType || 'unknown';
            bySource[source] = (bySource[source] || 0) + 1;
          });
        }
      } catch (e) {
        console.error('Error fetching index:', e);
      }
    }
    
    return NextResponse.json({
      hasIndex: !!indexBlob,
      trackingCount,
      bySource,
      indexSize: indexBlob?.size || 0,
      lastUpdated: indexBlob?.uploadedAt || null,
      combinedFiles: combinedFiles.map(f => {
        // Extract clean filename from pathname like "manifests/sanmar_combined-abc123.xlsx"
        const parts = f.pathname.split('/');
        const filename = parts[parts.length - 1];
        // Clean up the hash suffix: sanmar_combined-abc123.xlsx -> sanmar_combined.xlsx
        const cleanName = filename.replace(/-[A-Za-z0-9]+\./, '.');
        return {
          name: cleanName,
          url: f.url,
          size: f.size,
          uploadedAt: f.uploadedAt
        };
      })
    });
    
  } catch (error) {
    console.error('Error getting index stats:', error);
    return NextResponse.json({ 
      error: 'Failed to get index stats',
      hasIndex: false,
      trackingCount: 0
    }, { status: 500 });
  }
}

