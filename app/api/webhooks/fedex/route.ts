import { NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// Constants
const EVENTS_BLOB_PREFIX = 'fedex-events/';
const MAX_EVENTS_STORED = 1000;

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
 * FedEx Advanced Integrated Visibility (AIV) Webhook Handler
 * 
 * FedEx will send tracking updates to this endpoint when configured.
 * Events include: pickup, in transit, out for delivery, delivered, exceptions
 * 
 * To activate:
 * 1. Go to FedEx Developer Portal
 * 2. Create/select your project
 * 3. Enable "Track API" and "FedEx Advanced Integrated Visibility"
 * 4. Register webhook URL: https://package-confirmation-app.vercel.app/api/webhooks/fedex
 * 5. Select tracking event types to receive
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    console.log('FedEx Webhook received:', JSON.stringify(payload, null, 2).substring(0, 500));

    // Generate unique event ID with timestamp
    const timestamp = new Date().toISOString();
    const eventId = `${timestamp.replace(/[:.]/g, '-')}-${Math.random().toString(36).substring(2, 8)}`;

    // Parse the FedEx tracking event
    // FedEx AIV sends data in various formats depending on event type
    const trackingInfo = payload.trackingInfo || 
                         payload.output?.trackingInfo ||
                         payload.completeTrackResults?.[0]?.trackResults?.[0];
    
    const trackingNumber = trackingInfo?.trackingNumber || 
                          trackingInfo?.trackingNumberInfo?.trackingNumber ||
                          payload.trackingNumber;
    
    const latestStatus = trackingInfo?.latestStatusDetail || 
                         trackingInfo?.status ||
                         {};
    
    const status = latestStatus?.code || latestStatus?.statusCode || '';
    const statusDescription = latestStatus?.statusByLocale || 
                              latestStatus?.description ||
                              payload.eventDescription || '';
    
    // Get location info
    const scanLocation = trackingInfo?.scanEvents?.[0]?.scanLocation || 
                        payload.location || {};
    const location = scanLocation.city ? 
      `${scanLocation.city}, ${scanLocation.stateOrProvinceCode || scanLocation.countryCode}` : '';

    // Create structured event
    const event: FedExWebhookEvent = {
      id: eventId,
      receivedAt: timestamp,
      eventType: payload.eventType || payload.type || 'TRACKING_UPDATE',
      trackingNumber,
      status,
      statusDescription,
      location,
      timestamp: trackingInfo?.scanEvents?.[0]?.date || payload.timestamp,
      rawPayload: payload
    };
    
    // Store event in Vercel Blob
    await storeEvent(event);
    
    // Cleanup old events (fire and forget)
    cleanupOldEvents().catch(e => console.error('Cleanup error:', e));

    console.log(`FedEx Update: ${trackingNumber} - ${statusDescription}`);

    // FedEx expects a 200 response
    return NextResponse.json({
      success: true,
      message: 'Event received and stored',
      eventId: event.id,
      trackingNumber
    });

  } catch (error) {
    console.error('FedEx webhook error:', error);
    
    // Still return 200 to prevent FedEx from retrying
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 200 });
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
      const events = await getStoredEvents(1);
      
      return NextResponse.json({
        endpoint: '/api/webhooks/fedex',
        status: 'active',
        storage: 'vercel-blob',
        maxEventsStored: MAX_EVENTS_STORED,
        lastEvent: events.length > 0 ? {
          id: events[0].id,
          receivedAt: events[0].receivedAt,
          trackingNumber: events[0].trackingNumber,
          status: events[0].statusDescription
        } : null,
        message: 'FedEx Advanced Integrated Visibility webhook is ready',
        note: 'Events are persisted in Vercel Blob storage'
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
