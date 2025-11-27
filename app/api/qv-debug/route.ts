import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const UPS_CONFIG = {
  clientId: process.env.UPS_CLIENT_ID || '',
  clientSecret: process.env.UPS_CLIENT_SECRET || '',
  baseUrl: 'https://onlinetools.ups.com'
};

// ACTUAL subscription names from UPS Quantum View setup
const SUBSCRIPTION_NAMES = {
  inbound: ['PROMOS INK', 'Promos Ink Inc', '13911'],
  outbound: ['E45A82', 'W34D92', 'W34G18', 'K9Y228'],
  thirdParty: ['E45A82', 'W34D92', 'W34G18']
};

function getDateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0];
}

export async function GET() {
  try {
    // Step 1: Get OAuth token
    const credentials = Buffer.from(`${UPS_CONFIG.clientId}:${UPS_CONFIG.clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch(`${UPS_CONFIG.baseUrl}/security/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      return NextResponse.json({
        step: 'oauth',
        error: 'OAuth failed',
        status: tokenResponse.status,
        details: tokenError
      });
    }

    const tokenData = await tokenResponse.json();
    
    // Step 2: Try each subscription name
    const results: any[] = [];
    
    // Test all subscription names
    const allNames = [
      ...SUBSCRIPTION_NAMES.inbound.map(n => ({ name: n, type: 'inbound' })),
      ...SUBSCRIPTION_NAMES.outbound.map(n => ({ name: n, type: 'outbound' })),
      ...SUBSCRIPTION_NAMES.thirdParty.map(n => ({ name: n, type: 'thirdParty' }))
    ];
    
    // Remove duplicates
    const uniqueNames = allNames.filter((item, index, self) =>
      index === self.findIndex(t => t.name === item.name)
    );
    
    for (const { name: subName, type } of uniqueNames) {
      try {
        const qvResponse = await fetch(
          `${UPS_CONFIG.baseUrl}/api/quantumview/v1/response`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json',
              'transId': `qv-debug-${Date.now()}`,
              'transactionSrc': 'PromoInkSupplyChain'
            },
            body: JSON.stringify({
              QuantumViewRequest: {
                Request: {
                  TransactionReference: {
                    CustomerContext: 'PromoInkSupplyChain'
                  }
                },
                SubscriptionRequest: {
                  Name: subName,
                  DateTimeRange: {
                    BeginDateTime: getDateOffset(-7),
                    EndDateTime: getDateOffset(0)
                  }
                }
              }
            })
          }
        );

        // Get raw text first
        const rawText = await qvResponse.text();
        
        let parsed = null;
        try {
          if (rawText && rawText.trim()) {
            parsed = JSON.parse(rawText);
          }
        } catch (e) {
          // Keep raw text if can't parse
        }
        
        results.push({
          subscriptionName: subName,
          subscriptionType: type,
          httpStatus: qvResponse.status,
          rawResponseLength: rawText?.length || 0,
          rawResponse: rawText?.substring(0, 1500) || '(empty)',
          parsed,
          hasData: !!parsed?.QuantumViewResponse?.QuantumViewEvents
        });

      } catch (err) {
        results.push({
          subscriptionName: subName,
          subscriptionType: type,
          error: String(err)
        });
      }
    }

    return NextResponse.json({
      success: true,
      oauthWorking: true,
      subscriptionConfig: SUBSCRIPTION_NAMES,
      dateRange: {
        begin: getDateOffset(-7),
        end: getDateOffset(0)
      },
      results
    });

  } catch (error) {
    return NextResponse.json({
      error: String(error)
    }, { status: 500 });
  }
}
