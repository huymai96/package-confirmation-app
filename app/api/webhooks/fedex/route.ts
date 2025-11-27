import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Store for FedEx webhook events (in production, use Vercel Blob)
const webhookEvents: any[] = [];

/**
 * FedEx Advanced Integrated Visibility Webhook Handler
 * 
 * FedEx will send tracking updates to this endpoint when:
 * - Package is picked up
 * - Package is in transit
 * - Package is out for delivery
 * - Package is delivered
 * - Exception occurs
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    console.log('FedEx Webhook received:', JSON.stringify(payload, null, 2));

    // Store the event with timestamp
    const event = {
      receivedAt: new Date().toISOString(),
      type: payload.eventType || 'TRACKING_UPDATE',
      ...payload
    };
    
    webhookEvents.push(event);
    
    // Keep only last 1000 events in memory
    if (webhookEvents.length > 1000) {
      webhookEvents.splice(0, webhookEvents.length - 1000);
    }

    // Process the FedEx tracking event
    const trackingInfo = payload.trackingInfo || payload.output?.trackingInfo;
    
    if (trackingInfo) {
      const trackingNumber = trackingInfo.trackingNumber || 
                             trackingInfo.trackingNumberInfo?.trackingNumber;
      const status = trackingInfo.latestStatusDetail?.statusByLocale || 
                     trackingInfo.status;
      
      console.log(`FedEx Update: ${trackingNumber} - ${status}`);
      
      // TODO: Store in Vercel Blob for persistence
      // TODO: Send alerts for exceptions or deliveries
    }

    // FedEx expects a 200 response
    return NextResponse.json({
      success: true,
      message: 'Event received',
      eventId: event.receivedAt
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

  // Return webhook status
  if (action === 'status') {
    return NextResponse.json({
      endpoint: '/api/webhooks/fedex',
      status: 'active',
      eventsReceived: webhookEvents.length,
      lastEvent: webhookEvents.length > 0 
        ? webhookEvents[webhookEvents.length - 1].receivedAt 
        : null,
      message: 'FedEx Advanced Integrated Visibility webhook is ready'
    });
  }

  // Return recent events
  if (action === 'events') {
    const limit = parseInt(searchParams.get('limit') || '20');
    const recentEvents = webhookEvents.slice(-limit).reverse();
    
    return NextResponse.json({
      total: webhookEvents.length,
      showing: recentEvents.length,
      events: recentEvents
    });
  }

  // Default - show documentation
  return NextResponse.json({
    endpoint: '/api/webhooks/fedex',
    description: 'FedEx Advanced Integrated Visibility Webhook Handler',
    actions: {
      'POST': 'Receive FedEx tracking events (called by FedEx)',
      'GET ?action=status': 'Check webhook status',
      'GET ?action=events': 'View recent events',
      'GET ?action=events&limit=50': 'View more events'
    },
    setup: {
      step1: 'Go to https://developer.fedex.com',
      step2: 'Create organization and add shipping accounts',
      step3: 'Create a Webhook Project',
      step4: 'Set callback URL to: https://your-domain.vercel.app/api/webhooks/fedex',
      step5: 'Select tracking events you want to receive'
    }
  });
}

