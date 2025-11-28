import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// Debug endpoint to capture exactly what Make.com sends
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const allHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      allHeaders[key] = value;
    });

    let bodyInfo: Record<string, unknown> = {};
    let rawBodyPreview = '';
    let attachmentInfo: unknown[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const formEntries: Record<string, unknown> = {};
      
      const entries = Array.from(formData.entries());
      for (const [key, value] of entries) {
        if (value instanceof File) {
          const arrayBuffer = await value.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          formEntries[key] = {
            type: 'File',
            name: value.name,
            size: value.size,
            mimeType: value.type,
            first20Bytes: Array.from(bytes.slice(0, 20)),
            first20BytesHex: Array.from(bytes.slice(0, 20)).map(b => b.toString(16).padStart(2, '0')).join(' '),
            isZipSignature: bytes[0] === 0x50 && bytes[1] === 0x4B
          };
          attachmentInfo.push(formEntries[key]);
        } else {
          formEntries[key] = {
            type: 'string',
            value: String(value).substring(0, 200),
            length: String(value).length
          };
        }
      }
      bodyInfo = { format: 'multipart/form-data', entries: formEntries };
    } else {
      const bodyText = await request.text();
      rawBodyPreview = bodyText.substring(0, 2000);
      
      try {
        const jsonData = JSON.parse(bodyText);
        bodyInfo = { format: 'json', parsed: true };
        
        // Check attachments
        if (jsonData.attachments && Array.isArray(jsonData.attachments)) {
          for (const att of jsonData.attachments) {
            const content = att.content || att.data || '';
            
            // Try to decode as base64
            let decodedInfo: Record<string, unknown> = {};
            try {
              const cleanBase64 = content.replace(/[\r\n\s]/g, '');
              const decoded = Buffer.from(cleanBase64.slice(0, 100), 'base64');
              decodedInfo = {
                first20Bytes: Array.from(decoded.slice(0, 20)),
                first20BytesHex: Array.from(decoded.slice(0, 20)).map((b: number) => b.toString(16).padStart(2, '0')).join(' '),
                isZipSignature: decoded[0] === 0x50 && decoded[1] === 0x4B,
                startsWithPK: decoded.slice(0, 2).toString() === 'PK'
              };
            } catch (e) {
              decodedInfo = { decodeError: String(e) };
            }
            
            attachmentInfo.push({
              filename: att.filename || att.fileName || att.name,
              contentLength: content.length,
              contentPreview: content.substring(0, 100),
              hasNewlines: content.includes('\n'),
              hasCarriageReturns: content.includes('\r'),
              decoded: decodedInfo
            });
          }
        }
      } catch {
        bodyInfo = { format: 'text', parsed: false, preview: rawBodyPreview };
      }
    }

    const debugData = {
      timestamp: new Date().toISOString(),
      contentType,
      headers: allHeaders,
      body: bodyInfo,
      attachments: attachmentInfo,
      rawBodyPreview: rawBodyPreview.substring(0, 1000)
    };

    // Save debug data to blob for inspection
    const blob = await put(
      `debug/makecom_${Date.now()}.json`,
      JSON.stringify(debugData, null, 2),
      { access: 'public', contentType: 'application/json' }
    );

    return NextResponse.json({
      success: true,
      message: 'Debug data captured',
      debugUrl: blob.url,
      summary: {
        contentType,
        attachmentCount: attachmentInfo.length,
        attachments: attachmentInfo
      }
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Debug capture failed',
      details: String(error)
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Make.com Debug Endpoint',
    usage: 'POST data here to capture and analyze what Make.com sends',
    note: 'Results are saved to blob storage for inspection'
  });
}

