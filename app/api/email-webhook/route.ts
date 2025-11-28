import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// Webhook secret for security (set in Vercel env vars)
// Security model:
// 1. Make.com Mailhook URL is secret (only receiving@promosink.com knows it)
// 2. Make.com sends to Vercel with EMAIL_WEBHOOK_SECRET header
// 3. This endpoint validates the secret before processing
const WEBHOOK_SECRET = process.env.EMAIL_WEBHOOK_SECRET || 'promos-ink-email-2024';

// Map sender/subject patterns to manifest types
// Order matters! More specific patterns should come first
const MANIFEST_PATTERNS: Array<{
  type: string;
  defaultExt: string;
  patterns: {
    from?: RegExp[];
    subject?: RegExp[];
  };
}> = [
  {
    type: 'ss',
    defaultExt: 'xlsx',  // S&S sends XLSX
    patterns: {
      from: [/s\s*&\s*s/i, /ssactivewear/i, /@ssactivewear\.com/i, /ss\s*active/i],
      subject: [/s\s*&\s*s/i, /ssactivewear/i, /ss\s*active/i]  // Only match if S&S is in subject
    }
  },
  {
    type: 'sanmar',
    defaultExt: 'csv',  // Sanmar sends CSV
    patterns: {
      from: [/sanmar/i, /@sanmar\.com/i],
      subject: [/sanmar/i]  // Only match if "sanmar" is specifically in subject
    }
  },
  {
    type: 'alphabroder',
    defaultExt: 'xlsx',
    patterns: {
      from: [/alphabroder/i, /@alphabroder\.com/i],
      subject: [/alphabroder/i]
    }
  }
];

function detectManifestType(from: string, subject: string): { type: string; defaultExt: string } | null {
  console.log(`Detecting manifest type - From: "${from}", Subject: "${subject}"`);
  
  for (const pattern of MANIFEST_PATTERNS) {
    // Check from patterns first (more reliable)
    if (pattern.patterns.from) {
      for (const regex of pattern.patterns.from) {
        if (regex.test(from)) {
          console.log(`Matched ${pattern.type} by FROM pattern: ${regex}`);
          return { type: pattern.type, defaultExt: pattern.defaultExt };
        }
      }
    }
  }
  
  // Then check subject patterns
  for (const pattern of MANIFEST_PATTERNS) {
    if (pattern.patterns.subject) {
      for (const regex of pattern.patterns.subject) {
        if (regex.test(subject)) {
          console.log(`Matched ${pattern.type} by SUBJECT pattern: ${regex}`);
          return { type: pattern.type, defaultExt: pattern.defaultExt };
        }
      }
    }
  }
  
  console.log('No manifest type detected');
  return null;
}

// Configuration: How many recent manifests to keep per supplier
const MAX_MANIFESTS_PER_SUPPLIER = 10;

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

// Helper to get all manifests for a supplier type and clean up old ones
async function cleanupOldManifests(supplierType: string) {
  try {
    const { blobs } = await list();
    
    // Find all manifests for this supplier (e.g., sanmar_2025-11-28.csv)
    const supplierManifests = blobs
      .filter(b => b.pathname.startsWith(`manifests/${supplierType}_`))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    
    console.log(`Found ${supplierManifests.length} manifests for ${supplierType}`);
    
    // Delete manifests beyond the limit
    if (supplierManifests.length >= MAX_MANIFESTS_PER_SUPPLIER) {
      const toDelete = supplierManifests.slice(MAX_MANIFESTS_PER_SUPPLIER - 1); // Keep room for new one
      for (const blob of toDelete) {
        console.log(`Deleting old manifest: ${blob.pathname}`);
        await del(blob.url);
      }
    }
  } catch (error) {
    console.error(`Error cleaning up manifests for ${supplierType}:`, error);
  }
}

// Get date-time string for filename (includes time to handle multiple per day)
function getDateTimeString(): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const time = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
  return `${date}_${time}`;
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
      // Try to parse as JSON, but handle malformed JSON from Make.com
      const bodyText = await request.text();
      console.log('Raw body length:', bodyText.length);
      console.log('Raw body preview:', bodyText.substring(0, 500));
      
      try {
        rawData = JSON.parse(bodyText);
      } catch (jsonError) {
        console.log('JSON parse failed, trying to extract data manually');
        
        // Try to extract data from malformed JSON (Make.com issue)
        // Look for patterns in the malformed JSON
        const fromMatch = bodyText.match(/"from":\s*"([^"]+)"/);
        const subjectMatch = bodyText.match(/"subject":\s*"([^"]+)"/);
        const filenameMatch = bodyText.match(/"filename":\s*"([^"]+)"/);
        
        // Find content between "content": " and the end pattern
        const contentStartIndex = bodyText.indexOf('"content":');
        let fileContent = '';
        let filename = filenameMatch ? filenameMatch[1] : 'manifest.csv';
        
        if (contentStartIndex > -1) {
          // Find the actual content start (after "content": ")
          const actualContentStart = bodyText.indexOf('"', contentStartIndex + 10) + 1;
          // The content goes until near the end of the attachments array
          // Look for the closing pattern
          let contentEnd = bodyText.lastIndexOf('"\n    }');
          if (contentEnd === -1) contentEnd = bodyText.lastIndexOf('"}');
          if (contentEnd === -1) contentEnd = bodyText.length - 20;
          
          fileContent = bodyText.substring(actualContentStart, contentEnd);
          // Unescape the content
          fileContent = fileContent.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r');
        }
        
        rawData = {
          from: fromMatch ? fromMatch[1] : '',
          subject: subjectMatch ? subjectMatch[1] : '',
          attachments: fileContent ? [{
            filename: filename,
            content: fileContent
          }] : []
        };
        
        console.log('Extracted from malformed JSON:', {
          from: rawData.from,
          subject: rawData.subject,
          attachmentCount: rawData.attachments.length,
          contentLength: fileContent.length
        });
      }
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
      
      // Check if content is base64 or raw text
      // Base64 typically doesn't have newlines or CSV-like content at start
      const isRawText = attachment.content.includes('\n') || 
                        attachment.content.startsWith('"') ||
                        attachment.content.includes(',');
      console.log(`Attachment content type: ${isRawText ? 'raw text' : 'base64'}`);
      

      // Determine manifest type from detection or filename
      let manifestType = detected?.type;
      let defaultExt = detected?.defaultExt || 'csv';
      
      // Preserve original file extension from attachment
      const originalExt = attachment.filename.toLowerCase().split('.').pop() || 'csv';
      
      if (!manifestType) {
        // Try to detect from attachment filename
        const lowerFilename = attachment.filename.toLowerCase();
        if (lowerFilename.includes('s&s') || lowerFilename.includes('ssactivewear') || lowerFilename.includes('ss active') || lowerFilename.includes('ss_active')) {
          manifestType = 'ss';
          defaultExt = 'xlsx';
        } else if (lowerFilename.includes('sanmar') || lowerFilename.includes('freight')) {
          manifestType = 'sanmar';
          defaultExt = 'csv';
        } else {
          manifestType = 'unknown';
        }
      }
      
      // Use original extension from file, or default for the supplier
      const finalExt = ['xlsx', 'xls', 'csv'].includes(originalExt) ? originalExt : defaultExt;
      
      // Get date-time string for filename (allows multiple per day)
      const dateTimeStr = getDateTimeString();
      
      // Set target filename with date-time and correct extension
      // Format: supplier_YYYY-MM-DD_HHMMSS.ext (e.g., sanmar_2025-11-28_143025.csv)
      // This allows multiple manifests per day per supplier (different warehouses)
      let targetFilename: string;
      let supplierKey: string;
      
      if (manifestType === 'sanmar') {
        supplierKey = 'sanmar';
        targetFilename = `sanmar_${dateTimeStr}.${finalExt}`;
      } else if (manifestType === 'ss') {
        supplierKey = 's&s';
        targetFilename = `s&s_${dateTimeStr}.${finalExt}`;
      } else if (manifestType === 'alphabroder') {
        supplierKey = 'alphabroder';
        targetFilename = `alphabroder_${dateTimeStr}.${finalExt}`;
      } else {
        supplierKey = 'unknown';
        targetFilename = `${dateTimeStr}_${attachment.filename}`;
      }
      
      console.log(`Manifest type: ${manifestType}, Original ext: ${originalExt}, Final ext: ${finalExt}, Target: ${targetFilename}`);
      
      // Clean up old manifests for this supplier (keep only 10 most recent)
      if (supplierKey !== 'unknown') {
        await cleanupOldManifests(supplierKey);
      }

      try {
        // Handle both raw text and base64 encoded content
        let fileData: Buffer;
        try {
          if (isRawText) {
            // Content is raw text (like CSV from Make.com)
            fileData = Buffer.from(attachment.content, 'utf-8');
          } else {
            // Content is base64 encoded
            fileData = Buffer.from(attachment.content, 'base64');
          }
        } catch (bufferError) {
          console.error('Buffer creation error:', bufferError);
          results.push({
            filename: attachment.filename,
            type: manifestType,
            uploaded: false,
            error: `Buffer error: ${String(bufferError)}`
          });
          continue;
        }
        
        console.log(`File data size: ${fileData.length} bytes, target: ${targetFilename}`);
        const blobPath = `manifests/${targetFilename}`;
        // Each manifest gets unique timestamp, no need to check for existing

        // Determine content type
        const blobContentType = targetFilename.endsWith('.xlsx')
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : targetFilename.endsWith('.csv')
          ? 'text/csv'
          : 'application/octet-stream';

        console.log(`Uploading to blob: ${blobPath}, contentType: ${blobContentType}`);

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

