import { NextRequest, NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// FedEx API Configuration
const FEDEX_CONFIG = {
  apiKey: process.env.FEDEX_API_KEY || '',
  secretKey: process.env.FEDEX_SECRET_KEY || '',
  accountNumbers: (process.env.FEDEX_ACCOUNT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean),
  baseUrl: 'https://apis.fedex.com'
};

interface FedExToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Token cache
let tokenCache: { token: FedExToken; issued_at: number } | null = null;

/**
 * Get OAuth access token from FedEx
 */
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (tokenCache) {
    const now = Date.now();
    const expiresAt = tokenCache.issued_at + (tokenCache.token.expires_in * 1000) - 60000;
    if (now < expiresAt) {
      return tokenCache.token.access_token;
    }
  }

  const response = await fetch(`${FEDEX_CONFIG.baseUrl}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: FEDEX_CONFIG.apiKey,
      client_secret: FEDEX_CONFIG.secretKey
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`FedEx OAuth failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  tokenCache = {
    token: data,
    issued_at: Date.now()
  };

  return data.access_token;
}

/**
 * Create a webhook subscription for account-level tracking
 * NOTE: This requires FedEx AIV (Advanced Integrated Visibility) to be enabled
 */
async function createAccountSubscription(
  accountNumber: string, 
  webhookUrl: string,
  subscriptionName: string
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  try {
    const token = await getAccessToken();
    
    // FedEx Account Number Subscription API
    // https://developer.fedex.com/api/en-us/catalog/tracking-number-subscription.html
    const response = await fetch(`${FEDEX_CONFIG.baseUrl}/track/v1/subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US'
      },
      body: JSON.stringify({
        shipperAccountNumber: accountNumber,
        recipientAccountNumber: accountNumber, // Also monitor inbound
        destinationCountryCode: 'US',
        subscriptionDetails: {
          subscriptionName: subscriptionName,
          emailNotificationDetails: {
            emailNotificationRecipients: [] // We use webhook instead
          },
          webhookNotificationDetails: {
            url: webhookUrl,
            personalMessage: 'Promos Ink Supply Chain Visibility'
          },
          eventNotificationTypes: [
            'ON_FDX_TENDERED',
            'ON_DELIVERY',
            'ON_EXCEPTION',
            'ON_ESTIMATED_DELIVERY',
            'ON_SHIPMENT',
            'ON_PICKUP'
          ]
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { 
        success: false, 
        error: data.errors?.[0]?.message || `API Error: ${response.status}`,
        data 
      };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * GET - Check subscription status and provide setup instructions
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    // Check if webhook has received any events
    const { blobs } = await list({ prefix: 'fedex-events/' });
    
    return NextResponse.json({
      configured: !!(FEDEX_CONFIG.apiKey && FEDEX_CONFIG.secretKey),
      accountNumbers: FEDEX_CONFIG.accountNumbers,
      webhookUrl: 'https://package-confirmation-app.vercel.app/api/webhooks/fedex',
      eventsReceived: blobs.length,
      status: blobs.length > 0 ? 'active' : 'pending_activation',
      message: blobs.length > 0 
        ? 'FedEx AIV is active and receiving events'
        : 'FedEx AIV subscription needs to be created in FedEx Developer Portal',
      nextSteps: blobs.length === 0 ? [
        '1. Go to https://developer.fedex.com',
        '2. Navigate to your project settings',
        '3. Enable "Track API" and "Advanced Integrated Visibility"',
        '4. Create a webhook subscription with URL: https://package-confirmation-app.vercel.app/api/webhooks/fedex',
        '5. Link your FedEx account number(s) to the subscription',
        '6. FedEx will start pushing events for ALL shipments on your account'
      ] : []
    });
  }

  // Default: show documentation
  return NextResponse.json({
    endpoint: '/api/fedex-subscription',
    description: 'FedEx Account Number Subscription Management',
    problem: 'FedEx Track API only works with known tracking numbers. To see ALL shipments like fedex.com, you need Account Number Subscription.',
    solution: 'FedEx AIV (Advanced Integrated Visibility) pushes events for all shipments on your account to your webhook.',
    currentStatus: {
      accountNumbers: FEDEX_CONFIG.accountNumbers,
      webhookConfigured: 'https://package-confirmation-app.vercel.app/api/webhooks/fedex'
    },
    howItWorks: {
      step1: 'Create subscription in FedEx Developer Portal linking account to webhook',
      step2: 'FedEx pushes tracking events for ALL shipments (inbound, outbound, third-party)',
      step3: 'Webhook stores events in Vercel Blob',
      step4: '/api/fedex-visibility reads from stored events instead of polling'
    },
    manualSetup: {
      portalUrl: 'https://developer.fedex.com',
      webhookUrl: 'https://package-confirmation-app.vercel.app/api/webhooks/fedex',
      eventTypes: [
        'ON_FDX_TENDERED - Shipment created',
        'ON_PICKUP - Package picked up',
        'ON_SHIPMENT - In transit updates',
        'ON_ESTIMATED_DELIVERY - ETA updates',
        'ON_DELIVERY - Delivered',
        'ON_EXCEPTION - Delays/problems'
      ]
    },
    actions: {
      'GET ?action=status': 'Check subscription status',
      'POST': 'Attempt to create subscription programmatically (requires AIV enabled)'
    }
  });
}

/**
 * POST - Attempt to create subscription (requires FedEx AIV to be enabled)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accountNumber = body.accountNumber || FEDEX_CONFIG.accountNumbers[0];
    const subscriptionName = body.subscriptionName || 'PromoInk-Visibility';
    const webhookUrl = 'https://package-confirmation-app.vercel.app/api/webhooks/fedex';

    if (!accountNumber) {
      return NextResponse.json({
        error: 'No FedEx account number configured',
        hint: 'Set FEDEX_ACCOUNT_NUMBERS environment variable'
      }, { status: 400 });
    }

    console.log(`Attempting to create FedEx subscription for account ${accountNumber}...`);
    
    const result = await createAccountSubscription(accountNumber, webhookUrl, subscriptionName);

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        details: result.data,
        alternativeSetup: {
          message: 'If programmatic subscription fails, set up manually in FedEx Developer Portal',
          steps: [
            '1. Go to https://developer.fedex.com',
            '2. Select your project → Webhooks',
            '3. Create subscription with webhook URL: ' + webhookUrl,
            '4. Enable events: ON_FDX_TENDERED, ON_PICKUP, ON_SHIPMENT, ON_DELIVERY, ON_EXCEPTION',
            '5. Link account number: ' + accountNumber
          ]
        }
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscription created successfully',
      accountNumber,
      webhookUrl,
      subscriptionName,
      data: result.data
    });

  } catch (error) {
    console.error('Subscription creation error:', error);
    return NextResponse.json({
      error: String(error),
      message: 'Failed to create subscription. Manual setup may be required.'
    }, { status: 500 });
  }
}

