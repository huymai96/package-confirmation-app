import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// API Key for upload authentication (set in Vercel env vars)
const UPLOAD_API_KEY = process.env.MANIFEST_UPLOAD_KEY || 'promos-ink-2024';

// Supported manifest types
const MANIFEST_TYPES = {
  'customink': 'customink_orders.xlsx',
  'sanmar': 'sanmar.xlsx',
  'ss': 's&s.xlsx',
  'ssactivewear': 's&s.xlsx',
  'inbound': 'inbound.csv',
  'quantumview': 'inbound.csv'
} as const;

type ManifestType = keyof typeof MANIFEST_TYPES;

interface ManifestInfo {
  type: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

// Helper to get blob URL by name
async function getBlobByName(filename: string) {
  try {
    const { blobs } = await list();
    return blobs.find(b => b.pathname === filename);
  } catch (error) {
    console.error('Error listing blobs:', error);
    return null;
  }
}

// Helper to detect manifest type from filename
function detectManifestType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('sanmar')) return 'sanmar';
  if (lower.includes('s&s') || lower.includes('ss_') || lower.startsWith('ss')) return 'ss';
  if (lower.includes('customink')) return 'customink';
  if (lower.includes('inbound') || lower.includes('quantumview')) return 'inbound';
  if (lower.includes('alphabroder')) return 'alphabroder';
  return 'other';
}

// GET - List all manifests or download a specific one
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const type = searchParams.get('type') as ManifestType | null;

  // List all manifests
  if (action === 'list' || !action) {
    try {
      const { blobs } = await list({ prefix: 'manifests/' });
      
      const manifests: ManifestInfo[] = blobs
        .filter(b => b.pathname.startsWith('manifests/'))
        .map(blob => {
          const filename = blob.pathname.replace('manifests/', '');
          return {
            type: detectManifestType(filename),
            filename: filename,
            url: blob.url,
            size: blob.size,
            uploadedAt: blob.uploadedAt.toISOString()
          };
        })
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

      return NextResponse.json({
        manifests,
        count: manifests.length,
        types: Object.keys(MANIFEST_TYPES)
      });
    } catch (error) {
      console.error('Error listing manifests:', error);
      return NextResponse.json({ error: 'Failed to list manifests' }, { status: 500 });
    }
  }

  // Get specific manifest info
  if (action === 'info' && type) {
    const filename = MANIFEST_TYPES[type];
    if (!filename) {
      return NextResponse.json({ error: 'Invalid manifest type' }, { status: 400 });
    }

    const blob = await getBlobByName(`manifests/${filename}`);
    if (!blob) {
      return NextResponse.json({ 
        found: false, 
        type,
        message: `Manifest ${type} not found` 
      });
    }

    return NextResponse.json({
      found: true,
      type,
      filename: blob.pathname,
      url: blob.url,
      size: blob.size,
      uploadedAt: blob.uploadedAt.toISOString()
    });
  }

  // Download manifest data
  if (action === 'download' && type) {
    const filename = MANIFEST_TYPES[type];
    if (!filename) {
      return NextResponse.json({ error: 'Invalid manifest type' }, { status: 400 });
    }

    const blob = await getBlobByName(`manifests/${filename}`);
    if (!blob) {
      return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
    }

    // Redirect to blob URL for download
    return NextResponse.redirect(blob.url);
  }

  return NextResponse.json({
    message: 'Manifests API',
    endpoints: [
      'GET ?action=list - List all manifests',
      'GET ?action=info&type=customink - Get manifest info',
      'GET ?action=download&type=sanmar - Download manifest',
      'POST - Upload manifest (requires API key)'
    ],
    supportedTypes: Object.keys(MANIFEST_TYPES)
  });
}

// POST - Upload a manifest file
export async function POST(request: NextRequest) {
  try {
    // Check API key
    const apiKey = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (apiKey !== UPLOAD_API_KEY) {
      return NextResponse.json({ 
        error: 'Unauthorized', 
        message: 'Invalid or missing API key. Include x-api-key header.' 
      }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';
    
    let type: ManifestType;
    let fileData: Buffer;
    let originalFilename: string = '';

    // Handle multipart form data
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const manifestType = formData.get('type') as string | null;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      if (!manifestType || !(manifestType in MANIFEST_TYPES)) {
        return NextResponse.json({ 
          error: 'Invalid manifest type',
          supportedTypes: Object.keys(MANIFEST_TYPES)
        }, { status: 400 });
      }

      type = manifestType as ManifestType;
      originalFilename = file.name;
      const arrayBuffer = await file.arrayBuffer();
      fileData = Buffer.from(arrayBuffer);
    } 
    // Handle JSON with base64 data
    else if (contentType.includes('application/json')) {
      const body = await request.json();
      
      if (!body.type || !(body.type in MANIFEST_TYPES)) {
        return NextResponse.json({ 
          error: 'Invalid manifest type',
          supportedTypes: Object.keys(MANIFEST_TYPES)
        }, { status: 400 });
      }

      if (!body.data) {
        return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
      }

      type = body.type as ManifestType;
      originalFilename = body.filename || MANIFEST_TYPES[type];
      fileData = Buffer.from(body.data, 'base64');
    }
    // Handle raw file upload with type in query/header
    else {
      const typeParam = request.headers.get('x-manifest-type') || 
                        new URL(request.url).searchParams.get('type');
      
      if (!typeParam || !(typeParam in MANIFEST_TYPES)) {
        return NextResponse.json({ 
          error: 'Invalid manifest type. Provide x-manifest-type header or ?type= query param',
          supportedTypes: Object.keys(MANIFEST_TYPES)
        }, { status: 400 });
      }

      type = typeParam as ManifestType;
      originalFilename = MANIFEST_TYPES[type];
      const arrayBuffer = await request.arrayBuffer();
      fileData = Buffer.from(arrayBuffer);
    }

    const targetFilename = MANIFEST_TYPES[type];
    const blobPath = `manifests/${targetFilename}`;

    // Delete existing blob if exists
    const existingBlob = await getBlobByName(blobPath);
    if (existingBlob) {
      await del(existingBlob.url);
    }

    // Determine content type for blob
    const blobContentType = targetFilename.endsWith('.xlsx') 
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : targetFilename.endsWith('.csv')
      ? 'text/csv'
      : 'application/octet-stream';

    // Upload new blob
    const blob = await put(blobPath, fileData, {
      access: 'public',
      contentType: blobContentType
    });

    console.log(`Manifest uploaded: ${type} -> ${blobPath} (${fileData.length} bytes)`);

    return NextResponse.json({
      success: true,
      message: `Manifest ${type} uploaded successfully`,
      manifest: {
        type,
        filename: targetFilename,
        originalFilename,
        url: blob.url,
        size: fileData.length,
        uploadedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Manifest upload error:', error);
    return NextResponse.json({ 
      error: 'Upload failed', 
      details: String(error) 
    }, { status: 500 });
  }
}

// DELETE - Remove a manifest
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') as ManifestType | null;
  const blobUrl = searchParams.get('url');
  const apiKey = request.headers.get('x-api-key');

  if (apiKey !== UPLOAD_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Delete by URL (for cleanup of dated files)
  if (blobUrl) {
    try {
      await del(blobUrl);
      return NextResponse.json({
        success: true,
        message: 'Manifest deleted by URL'
      });
    } catch (error) {
      return NextResponse.json({ error: 'Failed to delete', details: String(error) }, { status: 500 });
    }
  }

  // Delete by type (legacy support)
  if (!type || !(type in MANIFEST_TYPES)) {
    return NextResponse.json({ error: 'Invalid manifest type or missing url parameter' }, { status: 400 });
  }

  const filename = MANIFEST_TYPES[type];
  const blob = await getBlobByName(`manifests/${filename}`);
  
  if (!blob) {
    return NextResponse.json({ error: 'Manifest not found' }, { status: 404 });
  }

  await del(blob.url);

  return NextResponse.json({
    success: true,
    message: `Manifest ${type} deleted`
  });
}

