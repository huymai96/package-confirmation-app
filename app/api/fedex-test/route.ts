import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Debug endpoint for FedEx API - shows raw responses
 * v2 - force deploy
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tracking = searchParams.get('tracking') || '886094855396';

  const apiKey = process.env.FEDEX_API_KEY || '';
  const secretKey = process.env.FEDEX_SECRET_KEY || '';

  // Step 1: Get OAuth token
  console.log('FedEx Debug: Getting OAuth token...');
  
  try {
    const tokenResponse = await fetch('https://apis.fedex.com/oauth/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: apiKey,
        client_secret: secretKey
      })
    });

    const tokenText = await tokenResponse.text();
    let tokenData;
    
    try {
      tokenData = JSON.parse(tokenText);
    } catch {
      return NextResponse.json({
        step: 'oauth',
        error: 'Failed to parse OAuth response',
        status: tokenResponse.status,
        raw: tokenText.substring(0, 500)
      });
    }

    if (!tokenResponse.ok) {
      return NextResponse.json({
        step: 'oauth',
        error: 'OAuth failed',
        status: tokenResponse.status,
        response: tokenData
      });
    }

    // Step 2: Call Track API
    console.log('FedEx Debug: Calling Track API...');
    
    const trackResponse = await fetch('https://apis.fedex.com/track/v1/trackingnumbers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
        'X-locale': 'en_US'
      },
      body: JSON.stringify({
        includeDetailedScans: true,
        trackingInfo: [{
          trackingNumberInfo: {
            trackingNumber: tracking
          }
        }]
      })
    });

    const trackText = await trackResponse.text();
    let trackData;
    
    try {
      trackData = JSON.parse(trackText);
    } catch {
      return NextResponse.json({
        step: 'track',
        error: 'Failed to parse Track response',
        status: trackResponse.status,
        raw: trackText.substring(0, 1000)
      });
    }

    // Return full debug info
    return NextResponse.json({
      success: true,
      tracking,
      oauth: {
        status: tokenResponse.status,
        hasToken: !!tokenData.access_token,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in
      },
      track: {
        status: trackResponse.status,
        response: trackData
      }
    });

  } catch (error) {
    return NextResponse.json({
      step: 'exception',
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

