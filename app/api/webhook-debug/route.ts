import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Debug endpoint to see exactly what Make.com sends
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const headers: Record<string, string> = {};
    
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body: unknown;
    let bodyText = '';
    
    try {
      bodyText = await request.text();
      body = JSON.parse(bodyText);
    } catch {
      body = bodyText;
    }

    const debug = {
      success: true,
      timestamp: new Date().toISOString(),
      contentType,
      headers,
      bodyType: typeof body,
      bodyKeys: typeof body === 'object' && body !== null ? Object.keys(body) : [],
      bodyPreview: typeof body === 'string' ? body.substring(0, 1000) : JSON.stringify(body, null, 2).substring(0, 2000),
      fullBody: body
    };

    console.log('Webhook Debug:', JSON.stringify(debug, null, 2));

    return NextResponse.json(debug);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({ 
      success: false, 
      error: String(error) 
    });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Debug webhook endpoint - POST to see what data is received',
    url: 'https://package-confirmation-app.vercel.app/api/webhook-debug'
  });
}

