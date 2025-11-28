import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// Webhook secret for security
const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET || 'promos-ink-email-2024';

// Map sender/subject patterns to manifest types
const MANIFEST_PATTERNS: Array<{
  type: string;
  filename: string;
  patterns: {
    from?: RegExp[];
    subject?: RegExp[];
  };
}> = [
  {
    type: 'sanmar',
    filename: 'sanmar.xlsx',
    patterns: {
      from: [/sanmar/i, /@sanmar\.com/i],
      subject: [/sanmar/i, /manifest/i, /shipment/i, /order/i]
    }
  },
  {
    type: 'ss',
    filename: 's&s.xlsx',
    patterns: {
      from: [/s\s*&\s*s/i, /ssactivewear/i, /@ssactivewear\.com/i],
      subject: [/s\s*&\s*s/i, /ssactivewear/i, /manifest/i, /shipment/i]
    }
  },
  {
    type: 'alphabroder',
    filename: 'alphabroder.xlsx',
    patterns: {
      from: [/alphabroder/i, /@alphabroder\.com/i],
      subject: [/alphabroder/i, /manifest/i, /shipment/i]
    }
  }
];

function detectManifestType(from: string, subject: string): { type: string; filename: string } | null {
  for (const pattern of MANIFEST_PATTERNS) {
    // Check from patterns
    if (pattern.patterns.from) {
      for (const regex of pattern.patterns.from) {
        if (regex.test(from)) {
          return { type: pattern.type, filename: pattern.filename };
        }
      }
    }
    // Check subject patterns
    if (pattern.patterns.subject) {
      for (const regex of pattern.patterns.subject) {
        if (regex.test(subject)) {
          return { type: pattern.type, filename: pattern.filename };
        }
      }
    }
  }
  return null;
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

// POST - Receive email webhook from Zapier/Make/Power Automate
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    // Verify webhook secret
    const authHeader = request.headers.get('authorization') || request.headers.get('x-webhook-secret');
    const providedSecret = authHeader?.replace('Bearer ', '');
    
    if (providedSecret !== WEBHOOK_SECRET) {
      console.log('Email webhook: Invalid secret');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawData: any;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      rawData = {
        from: formData.get('from') as string || '',
        subject: formData.get('subject') as string || '',
        attachments: []
      };
      
      // Handle file uploads
      const entries = Array.from(formData.entries());
      for (const [key, value] of entries) {
        if (value instanceof File) {
          const arrayBuffer = await value.arrayBuffer();
          rawData.attachments.push({
            filename: value.name,
            fileName: value.name,
            content: Buffer.from(arrayBuffer).toString('base64'),
            data: Buffer.from(arrayBuffer).toString('base64'),
            contentType: value.type
          });
        }
      }
    } else {
      rawData = await request.json();
    }

    console.log('Email webhook raw data keys:', Object.keys(rawData));
    console.log('Email webhook raw data:', JSON.stringify(rawData).substring(0, 500));

    // Extract from address - handle Make.com nested structure
    let from = '';
    if (typeof rawData.from === 'string') {
      from = rawData.from;
    } else if (rawData.from?.address) {
      from = rawData.from.address;
    } else if (rawData.from?.text) {
      from = rawData.from.text;
    }

    const subject = rawData.subject || '';
    
    console.log(`Email webhook received - From: ${from}, Subject: ${subject}`);

    // Normalize attachments - handle various formats from Make.com
    interface NormalizedAttachment {
      filename: string;
      content: string;
    }
    
    let attachments: NormalizedAttachment[] = [];
    
    // Handle Make.com array format
    if (Array.isArray(rawData.attachments)) {
      attachments = rawData.attachments.map((att: { filename?: string; fileName?: string; name?: string; content?: string; data?: string }) => ({
        filename: att.filename || att.fileName || att.name || 'attachment.xlsx',
        content: att.content || att.data || ''
      }));
    }
    
    // Handle flat structure from some services
    if (attachments.length === 0) {
      const flatFilename = rawData.attachment_filename || rawData.attachmentFilename || rawData.fileName || rawData.filename;
      const flatContent = rawData.attachment_content || rawData.attachment_base64 || rawData.attachmentContent || rawData.data || rawData.content;
      
      if (flatFilename && flatContent) {
        attachments = [{
          filename: flatFilename,
          content: flatContent
        }];
      }
    }

    console.log(`Email webhook: Found ${attachments.length} attachments`);

    if (attachments.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No attachments found in email',
        debug: {
          rawDataKeys: Object.keys(rawData),
          hasAttachmentsArray: Array.isArray(rawData.attachments),
          attachmentsLength: rawData.attachments?.length
        }
      });
    }

    // Detect manifest type
    const detected = detectManifestType(from, subject);
    
    const results: Array<{
      filename: string;
      type: string;
      uploaded: boolean;
      url?: string;
      error?: string;
    }> = [];

    for (const attachment of attachments) {
      console.log(`Processing attachment: ${attachment.filename}, content length: ${attachment.content?.length || 0}`);
      
      // Skip non-spreadsheet files
      const ext = attachment.filename.toLowerCase().split('.').pop();
      if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
        results.push({
          filename: attachment.filename,
          type: 'skipped',
          uploaded: false,
          error: 'Not a spreadsheet file'
        });
        continue;
      }
      
      // Skip if no content
      if (!attachment.content) {
        results.push({
          filename: attachment.filename,
          type: 'skipped',
          uploaded: false,
          error: 'No content data'
        });
        continue;
      }

      // Determine manifest type from detection or filename
      let manifestType = detected?.type;
      let targetFilename = detected?.filename;
      
      if (!manifestType) {
        // Try to detect from attachment filename
        const lowerFilename = attachment.filename.toLowerCase();
        if (lowerFilename.includes('sanmar')) {
          manifestType = 'sanmar';
          targetFilename = 'sanmar.xlsx';
        } else if (lowerFilename.includes('s&s') || lowerFilename.includes('ss') || lowerFilename.includes('activewear')) {
          manifestType = 'ss';
          targetFilename = 's&s.xlsx';
        } else {
          // Default to the original filename
          manifestType = 'unknown';
          targetFilename = attachment.filename;
        }
      }

      try {
        const fileData = Buffer.from(attachment.content, 'base64');
        const blobPath = `manifests/${targetFilename}`;

        // Delete existing
        const existingBlob = await getBlobByName(blobPath);
        if (existingBlob) {
          await del(existingBlob.url);
        }

        // Determine content type
        const blobContentType = targetFilename?.endsWith('.xlsx')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : targetFilename?.endsWith('.csv')
          ? 'text/csv'
          : 'application/octet-stream';

        // Upload
        const blob = await put(blobPath, fileData, {
          access: 'public',
          contentType: blobContentType
        });

        console.log(`Email webhook: Uploaded ${attachment.filename} as ${manifestType} -> ${blobPath}`);

        results.push({
          filename: attachment.filename,
          type: manifestType,
          uploaded: true,
          url: blob.url
        });
      } catch (error) {
        console.error(`Email webhook: Failed to upload ${attachment.filename}:`, error);
        results.push({
          filename: attachment.filename,
          type: manifestType,
          uploaded: false,
          error: String(error)
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.length} attachment(s)`,
      from,
      subject,
      detectedType: detected?.type || 'unknown',
      results
    });

  } catch (error) {
    console.error('Email webhook error:', error);
    return NextResponse.json({ 
      error: 'Failed to process email', 
      details: String(error) 
    }, { status: 500 });
  }
}

// GET - Test endpoint / info
export async function GET() {
  return NextResponse.json({
    endpoint: 'Email Webhook for Manifest Auto-Capture',
    usage: 'POST email data with attachments',
    supportedFormats: ['xlsx', 'xls', 'csv'],
    detectedSuppliers: MANIFEST_PATTERNS.map(p => p.type),
    webhookUrl: 'https://package-confirmation-app.vercel.app/api/email-webhook',
    requiredHeaders: {
      'Authorization': 'Bearer <EMAIL_WEBHOOK_SECRET>',
      'Content-Type': 'application/json'
    },
    examplePayload: {
      from: 'shipping@sanmar.com',
      subject: 'Your Sanmar Shipment Manifest',
      attachments: [{
        filename: 'manifest.xlsx',
        content: '<base64 encoded file>'
      }]
    }
  });
}

