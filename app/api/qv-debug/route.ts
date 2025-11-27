import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const UPS_CONFIG = {
  clientId: process.env.UPS_CLIENT_ID || '',
  clientSecret: process.env.UPS_CLIENT_SECRET || '',
  accountNumbers: (process.env.UPS_ACCOUNT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean),
  baseUrl: 'https://onlinetools.ups.com'
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
        details: tokenError,
        config: {
          hasClientId: !!UPS_CONFIG.clientId,
          hasClientSecret: !!UPS_CONFIG.clientSecret,
          accountNumbers: UPS_CONFIG.accountNumbers
        }
      });
    }

    const tokenData = await tokenResponse.json();
    
    // Step 2: Try Quantum View for each account
    const results: any[] = [];
    
    for (const accountNumber of UPS_CONFIG.accountNumbers) {
      // Try different subscription name formats
      const subscriptionNames = [
        accountNumber,
        `QV_${accountNumber}`,
        `${accountNumber}_INBOUND`,
        `${accountNumber}_OUTBOUND`
      ];

      for (const subName of subscriptionNames) {
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
                      CustomerContext: 'Debug'
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

          const qvData = await qvResponse.json();
          
          results.push({
            accountNumber,
            subscriptionName: subName,
            httpStatus: qvResponse.status,
            hasData: !!qvData.QuantumViewResponse?.QuantumViewEvents,
            response: qvData
          });

        } catch (err) {
          results.push({
            accountNumber,
            subscriptionName: subName,
            error: String(err)
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      oauthWorking: true,
      config: {
        accountNumbers: UPS_CONFIG.accountNumbers,
        hasClientId: !!UPS_CONFIG.clientId
      },
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

