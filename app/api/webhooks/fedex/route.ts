import { NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Constants
const EVENTS_BLOB_PREFIX = 'fedex-events/';
const MAX_EVENTS_STORED = 1000;
const FEDEX_WEBHOOK_TOKEN = process.env.FEDEX_WEBHOOK_TOKEN || '';

// Debug mode - set to true to accept all requests and log everything
const DEBUG_MODE = true;

interface FedExWebhookEvent {
  id: string;
  receivedAt: string;
  eventType: string;
  trackingNumber?: string;
  status?: string;
  statusDescription?: string;
  location?: string;
  timestamp?: string;
  rawPayload: unknown;
  headers?: Record<string, string>;
}

/**
 * Store a webhook event in Vercel Blob
 */
async function storeEvent(event: FedExWebhookEvent): Promise<void> {
  const blobPath = `${EVENTS_BLOB_PREFIX}${event.id}.json`;
  
  await put(blobPath, JSON.stringify(event), {
    access: 'public',
    contentType: 'application/json'
  });
  
  console.log(`FedEx webhook event stored: ${event.id}`);
}

/**
 * Get recent webhook events from Vercel Blob
 */
async function getStoredEvents(limit: number = 50): Promise<FedExWebhookEvent[]> {
  try {
    const { blobs } = await list({ prefix: EVENTS_BLOB_PREFIX });
    
    // Sort by name (which includes timestamp) descending
    const sortedBlobs = blobs.sort((a, b) => 
      b.pathname.localeCompare(a.pathname)
    ).slice(0, limit);
    
    const events: FedExWebhookEvent[] = [];
    
    for (const blob of sortedBlobs) {
      try {
        const response = await fetch(blob.url);
        if (response.ok) {
          const event = await response.json();
          events.push(event);
        }
      } catch (e) {
        console.error(`Error reading event ${blob.pathname}:`, e);
      }
    }
    
    return events;
  } catch (error) {
    console.error('Error listing FedEx events:', error);
    return [];
  }
}

/**
 * Cleanup old events (keep only MAX_EVENTS_STORED)
 */
async function cleanupOldEvents(): Promise<void> {
  try {
    const { blobs } = await list({ prefix: EVENTS_BLOB_PREFIX });
    
    if (blobs.length <= MAX_EVENTS_STORED) return;
    
    // Sort by name ascending (oldest first)
    const sortedBlobs = blobs.sort((a, b) => 
      a.pathname.localeCompare(b.pathname)
    );
    
    // Delete oldest events
    const toDelete = sortedBlobs.slice(0, blobs.length - MAX_EVENTS_STORED);
    
    for (const blob of toDelete) {
      await del(blob.url);
      console.log(`Deleted old FedEx event: ${blob.pathname}`);
    }
  } catch (error) {
    console.error('Error cleaning up FedEx events:', error);
  }
}

/**
 * Verify FedEx HMAC signature
 * FedEx uses the Security Token to create HMAC-SHA256 signature
 */
function verifyFedExSignature(headers: Headers, body: string): { valid: boolean; method: string; details: string } {
  // Get all possible signature headers
  const signature = 
    headers.get('x-fedex-signature') ||
    headers.get('x-fedex-webhook-signature') ||
    headers.get('x-hub-signature-256') ||
    headers.get('x-signature');
  
  // If no token configured, skip validation
  if (!FEDEX_WEBHOOK_TOKEN) {
    console.log('FedEx webhook: No FEDEX_WEBHOOK_TOKEN configured, skipping validation');
    return { valid: true, method: 'no-token', details: 'Token not configured, accepting all' };
  }
  
  // If no signature provided by FedEx
  if (!signature) {
    console.log('FedEx webhook: No signature header found');
    // In debug mode, accept anyway
    if (DEBUG_MODE) {
      return { valid: true, method: 'debug-mode', details: 'No signature, accepted in debug mode' };
    }
    return { valid: false, method: 'missing', details: 'No signature header provided' };
  }
  
  try {
    // Calculate expected HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', FEDEX_WEBHOOK_TOKEN)
      .update(body)
      .digest('hex');
    
    // FedEx might prefix with "sha256=" or send raw
    const providedSig = signature.replace(/^sha256=/, '').toLowerCase();
    const expectedSig = expectedSignature.toLowerCase();
    
    console.log('FedEx signature check:');
    console.log('  Provided (first 16 chars):', providedSig.substring(0, 16));
    console.log('  Expected (first 16 chars):', expectedSig.substring(0, 16));
    
    // Use timing-safe comparison
    const isValid = providedSig.length === expectedSig.length && 
      crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig));
    
    if (isValid) {
      return { valid: true, method: 'hmac-verified', details: 'HMAC signature verified' };
    } else {
      // In debug mode, accept anyway but log the mismatch
      if (DEBUG_MODE) {
        console.log('FedEx webhook: Signature mismatch, but accepting in debug mode');
        return { valid: true, method: 'debug-mode', details: 'Signature mismatch, accepted in debug mode' };
      }
      return { valid: false, method: 'hmac-failed', details: 'HMAC signature mismatch' };
    }
  } catch (error) {
    console.error('FedEx signature verification error:', error);
    if (DEBUG_MODE) {
      return { valid: true, method: 'debug-mode', details: `Verification error: ${error}, accepted in debug mode` };
    }
    return { valid: false, method: 'error', details: String(error) };
  }
}

/**
 * Extract headers as object for logging (redacting sensitive values)
 */
function getHeadersForLogging(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('token') || lowerKey.includes('secret') || lowerKey.includes('auth') || lowerKey.includes('signature')) {
      result[key] = value.length > 20 ? `[REDACTED - ${value.length} chars]` : `[REDACTED]`;
    } else {
      result[key] = value;
    }
  });
  return result;
}

/**
 * FedEx Advanced Integrated Visibility (AIV) Webhook Handler
 * 
 * FedEx will send tracking updates to this endpoint when configured.
 * Events include: pickup, in transit, out for delivery, delivered, exceptions
 * 
 * Security: Validates HMAC-SHA256 signature using FEDEX_WEBHOOK_TOKEN
 * Project: AIV
 * 
 * IMPORTANT: FedEx requires 200 OK response - never return 4xx/5xx
 */
export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  
  // Log all incoming requests for debugging
  console.log('='.repeat(60));
  console.log(`FedEx Webhook received at ${timestamp}`);
  console.log('='.repeat(60));
  
  // Get headers for logging
  const headersForLog = getHeadersForLogging(request.headers);
  console.log('Headers:', JSON.stringify(headersForLog, null, 2));
  
  // Read body as text first (needed for HMAC verification)
  let bodyText: string;
  try {
    bodyText = await request.text();
    console.log('Body length:', bodyText.length);
    console.log('Body preview:', bodyText.substring(0, 500));
  } catch (e) {
    console.error('Error reading request body:', e);
    // Still return 200 to FedEx
    return new Response(JSON.stringify({ received: true, error: 'body-read-error' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Verify HMAC signature (but don't reject in debug mode)
  const signatureResult = verifyFedExSignature(request.headers, bodyText);
  console.log('Signature validation:', signatureResult);
  
  // Parse the body as JSON
  let payload: any;
  try {
    payload = JSON.parse(bodyText);
    console.log('Parsed payload keys:', Object.keys(payload));
  } catch (e) {
    console.error('Error parsing JSON:', e);
    // Store raw body for debugging
    const eventId = `${timestamp.replace(/[:.]/g, '-')}-parse-error`;
    await storeEvent({
      id: eventId,
      receivedAt: timestamp,
      eventType: 'PARSE_ERROR',
      rawPayload: { bodyText: bodyText.substring(0, 1000), parseError: String(e) },
      headers: headersForLog
    });
    
    // Still return 200 to FedEx
    return new Response(JSON.stringify({ received: true, parseError: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  console.log('FedEx Webhook payload:', JSON.stringify(payload, null, 2).substring(0, 1000));

  try {
    // Generate unique event ID
    const eventId = `${timestamp.replace(/[:.]/g, '-')}-${Math.random().toString(36).substring(2, 8)}`;

    // Parse the FedEx tracking event
    // FedEx AIV sends data in various formats depending on event type
    const trackingInfo = payload.trackingInfo || 
                         payload.output?.trackingInfo ||
                         payload.completeTrackResults?.[0]?.trackResults?.[0] ||
                         payload;
    
    const trackingNumber = trackingInfo?.trackingNumber || 
                          trackingInfo?.trackingNumberInfo?.trackingNumber ||
                          payload.trackingNumber ||
                          payload.shipmentTrackingNumber ||
                          'UNKNOWN';
    
    const latestStatus = trackingInfo?.latestStatusDetail || 
                         trackingInfo?.status ||
                         payload.status ||
                         {};
    
    const status = latestStatus?.code || latestStatus?.statusCode || payload.eventType || '';
    const statusDescription = latestStatus?.statusByLocale || 
                              latestStatus?.description ||
                              payload.eventDescription ||
                              payload.description ||
                              '';
    
    // Get location info - try multiple paths
    const scanLocation = trackingInfo?.scanEvents?.[0]?.scanLocation || 
                        payload.location ||
                        payload.scanLocation ||
                        {};
    const location = scanLocation.city ? 
      `${scanLocation.city}, ${scanLocation.stateOrProvinceCode || scanLocation.countryCode || ''}` : '';

    // Create structured event with headers for debugging
    const event: FedExWebhookEvent = {
      id: eventId,
      receivedAt: timestamp,
      eventType: payload.eventType || payload.type || payload.event || 'TRACKING_UPDATE',
      trackingNumber,
      status,
      statusDescription,
      location,
      timestamp: trackingInfo?.scanEvents?.[0]?.date || payload.timestamp || payload.eventTimestamp,
      rawPayload: payload,
      headers: headersForLog // Include headers for debugging
    };
    
    // Store event in Vercel Blob
    await storeEvent(event);
    
    // Cleanup old events (fire and forget)
    cleanupOldEvents().catch(e => console.error('Cleanup error:', e));

    console.log(`FedEx Event stored: ${eventId}`);
    console.log(`  Tracking: ${trackingNumber}`);
    console.log(`  Status: ${statusDescription}`);
    console.log(`  Signature: ${signatureResult.method}`);

    // FedEx REQUIRES 200 OK response
    return new Response(JSON.stringify({
      success: true,
      received: true,
      eventId: event.id,
      trackingNumber,
      signatureValidation: signatureResult.method
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('FedEx webhook processing error:', error);
    
    // Store error event for debugging
    try {
      const errorEventId = `${timestamp.replace(/[:.]/g, '-')}-error`;
      await storeEvent({
        id: errorEventId,
        receivedAt: timestamp,
        eventType: 'PROCESSING_ERROR',
        rawPayload: { payload, error: String(error), stack: (error as Error).stack },
        headers: headersForLog
      });
    } catch (e) {
      console.error('Failed to store error event:', e);
    }
    
    // ALWAYS return 200 to FedEx to prevent retries
    return new Response(JSON.stringify({
      received: true,
      processed: false,
      error: String(error)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * GET endpoint for checking webhook status and recent events
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  try {
    // Return webhook status
    if (action === 'status') {
      const { blobs } = await list({ prefix: EVENTS_BLOB_PREFIX });
      const events = await getStoredEvents(3);
      const totalEvents = blobs.length;
      
      return NextResponse.json({
        endpoint: '/api/webhooks/fedex',
        status: totalEvents > 0 ? 'active_receiving' : 'active_waiting',
        projectName: 'AIV',
        debugMode: DEBUG_MODE,
        security: {
          tokenConfigured: !!FEDEX_WEBHOOK_TOKEN,
          tokenLength: FEDEX_WEBHOOK_TOKEN ? FEDEX_WEBHOOK_TOKEN.length : 0,
          hmacValidation: 'HMAC-SHA256',
          acceptAllInDebug: DEBUG_MODE
        },
        storage: 'vercel-blob',
        maxEventsStored: MAX_EVENTS_STORED,
        totalEventsReceived: totalEvents,
        recentEvents: events.slice(0, 3).map(e => ({
          id: e.id,
          receivedAt: e.receivedAt,
          trackingNumber: e.trackingNumber,
          eventType: e.eventType,
          status: e.statusDescription,
          hasHeaders: !!e.headers
        })),
        message: totalEvents > 0 
          ? `FedEx AIV active - ${totalEvents} events received`
          : 'FedEx AIV webhook ready - waiting for events from FedEx',
        note: DEBUG_MODE 
          ? '⚠️ DEBUG MODE: Accepting all requests regardless of signature'
          : 'Events are persisted in Vercel Blob storage',
        aivProject: {
          name: 'AIV',
          webhookUrl: 'https://package-confirmation-app.vercel.app/api/webhooks/fedex',
          status: totalEvents > 0 ? 'Connected' : 'Pending first event'
        }
      });
    }

    // Return recent events
    if (action === 'events') {
      const limit = parseInt(searchParams.get('limit') || '50');
      const events = await getStoredEvents(limit);
      
      // Return summary (without full rawPayload)
      const eventSummaries = events.map(e => ({
        id: e.id,
        receivedAt: e.receivedAt,
        eventType: e.eventType,
        trackingNumber: e.trackingNumber,
        status: e.status,
        statusDescription: e.statusDescription,
        location: e.location,
        timestamp: e.timestamp
      }));
      
      return NextResponse.json({
        total: events.length,
        showing: eventSummaries.length,
        events: eventSummaries
      });
    }

    // Return single event with full payload
    if (action === 'event') {
      const eventId = searchParams.get('id');
      if (!eventId) {
        return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
      }
      
      const events = await getStoredEvents(500);
      const event = events.find(e => e.id === eventId);
      
      if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }
      
      return NextResponse.json(event);
    }

    // Default - show documentation
    return NextResponse.json({
      endpoint: '/api/webhooks/fedex',
      description: 'FedEx Advanced Integrated Visibility (AIV) Webhook Handler',
      storage: 'Vercel Blob (persistent)',
      actions: {
        'POST': 'Receive FedEx tracking events (called by FedEx)',
        'GET ?action=status': 'Check webhook status and last event',
        'GET ?action=events': 'View recent events (summaries)',
        'GET ?action=events&limit=100': 'View more events',
        'GET ?action=event&id=XXX': 'View full event details'
      },
      setup: {
        step1: 'Go to https://developer.fedex.com',
        step2: 'Create organization and add shipping accounts',
        step3: 'Create or select your API project',
        step4: 'Enable "Track API" and "FedEx Advanced Integrated Visibility"',
        step5: 'Register webhook callback URL: https://package-confirmation-app.vercel.app/api/webhooks/fedex',
        step6: 'Select tracking event types: PICKUP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, EXCEPTION',
        step7: 'Subscribe your FedEx account numbers to receive events'
      },
      eventTypes: [
        'PICKUP - Package picked up',
        'IN_TRANSIT - Package in transit',
        'OUT_FOR_DELIVERY - Package out for delivery',
        'DELIVERED - Package delivered',
        'EXCEPTION - Delay or exception occurred',
        'ESTIMATED_DELIVERY - Delivery estimate updated'
      ]
    });
  } catch (error) {
    console.error('FedEx webhook GET error:', error);
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}
