/**
 * FedEx Integration
 * 
 * Provides:
 * - Real-time package tracking via FedEx Track API
 * - FedEx Advanced Integrated Visibility (webhooks)
 * - Multi-location support
 */

// FedEx API Configuration
const FEDEX_CONFIG = {
  apiKey: process.env.FEDEX_API_KEY || '',
  secretKey: process.env.FEDEX_SECRET_KEY || '',
  accountNumbers: (process.env.FEDEX_ACCOUNT_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean),
  baseUrl: 'https://apis.fedex.com', // Production URL
  // baseUrl: 'https://apis-sandbox.fedex.com', // Sandbox URL for testing
};

interface FedExToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  issued_at: number;
}

interface FedExTrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  description: string;
}

interface FedExPackage {
  trackingNumber: string;
  status: string;
  statusDescription: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  origin: {
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  destination: {
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  service: string;
  weight?: string;
  events: FedExTrackingEvent[];
  isException: boolean;
  exceptionReason?: string;
  signedBy?: string;
  // Reference fields
  shipperReference?: string;
  poNumber?: string;
  invoiceNumber?: string;
  customerReference?: string;
  shipperName?: string;
  recipientName?: string;
}

// Token cache
let tokenCache: FedExToken | null = null;

/**
 * Get OAuth access token from FedEx
 */
async function getAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  if (tokenCache) {
    const now = Date.now();
    const expiresAt = tokenCache.issued_at + (tokenCache.expires_in * 1000) - 60000; // 1 min buffer
    if (now < expiresAt) {
      return tokenCache.access_token;
    }
  }

  // Get new token
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
    console.error('FedEx OAuth failed:', response.status, errorText);
    throw new Error(`FedEx OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  tokenCache = {
    ...data,
    issued_at: Date.now()
  };

  return tokenCache!.access_token;
}

/**
 * Track a single FedEx package
 */
export async function trackPackage(trackingNumber: string): Promise<FedExPackage | null> {
  try {
    const token = await getAccessToken();
    
    const response = await fetch(
      `${FEDEX_CONFIG.baseUrl}/track/v1/trackingnumbers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-locale': 'en_US'
        },
        body: JSON.stringify({
          includeDetailedScans: true,
          trackingInfo: [
            {
              trackingNumberInfo: {
                trackingNumber: trackingNumber
              }
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`FedEx Tracking failed: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();
    
    // Parse FedEx response
    const trackResult = data.output?.completeTrackResults?.[0]?.trackResults?.[0];
    if (!trackResult) return null;

    const latestStatus = trackResult.latestStatusDetail;
    const dateAndTimes = trackResult.dateAndTimes || [];
    const scanEvents = trackResult.scanEvents || [];

    // Parse events
    const events: FedExTrackingEvent[] = scanEvents.map((scan: any) => ({
      date: scan.date?.split('T')[0] || '',
      time: scan.date?.split('T')[1]?.substring(0, 8) || '',
      location: `${scan.scanLocation?.city || ''}, ${scan.scanLocation?.stateOrProvinceCode || ''}`,
      status: scan.eventType || '',
      description: scan.eventDescription || ''
    }));

    // Get delivery date
    const estimatedDelivery = dateAndTimes.find((d: any) => d.type === 'ESTIMATED_DELIVERY')?.dateTime;
    const actualDelivery = dateAndTimes.find((d: any) => d.type === 'ACTUAL_DELIVERY')?.dateTime;

    const isException = latestStatus?.statusByLocale?.toLowerCase().includes('exception') ||
                        latestStatus?.code === 'DE' || 
                        latestStatus?.code === 'SE';

    // Extract reference numbers from shipment details
    const shipmentDetails = trackResult.shipmentDetails || {};
    const packageDetails = trackResult.packageDetails || {};
    
    // FedEx stores references in different places
    const references = packageDetails.packageContent?.contentPieceList?.[0]?.references || 
                       shipmentDetails.contents?.[0]?.references ||
                       trackResult.shipperInformation?.contact?.references || [];
    
    // Parse reference fields
    let shipperReference = '';
    let poNumber = '';
    let invoiceNumber = '';
    let customerReference = '';
    
    if (Array.isArray(references)) {
      for (const ref of references) {
        const type = (ref.type || ref.referenceType || '').toUpperCase();
        const value = ref.value || ref.referenceValue || '';
        
        if (type.includes('PO') || type.includes('PURCHASE')) {
          poNumber = value;
        } else if (type.includes('INVOICE') || type.includes('INV')) {
          invoiceNumber = value;
        } else if (type.includes('SHIPPER') || type === 'SHIPPER_REFERENCE') {
          shipperReference = value;
        } else if (type.includes('CUSTOMER') || type === 'CUSTOMER_REFERENCE') {
          customerReference = value;
        } else if (!shipperReference && value) {
          shipperReference = value; // Use first reference as shipper reference if no specific type
        }
      }
    }

    // Get shipper and recipient names
    const shipperName = trackResult.shipperInformation?.contact?.companyName || 
                        trackResult.shipperInformation?.contact?.personName || '';
    const recipientName = trackResult.recipientInformation?.contact?.companyName ||
                          trackResult.recipientInformation?.contact?.personName || '';

    return {
      trackingNumber,
      status: latestStatus?.code || 'Unknown',
      statusDescription: latestStatus?.statusByLocale || latestStatus?.description || 'Unknown',
      estimatedDelivery: estimatedDelivery?.split('T')[0],
      actualDelivery: actualDelivery?.split('T')[0],
      origin: {
        city: trackResult.originLocation?.locationContactAndAddress?.address?.city || '',
        state: trackResult.originLocation?.locationContactAndAddress?.address?.stateOrProvinceCode || '',
        country: trackResult.originLocation?.locationContactAndAddress?.address?.countryCode || '',
        postalCode: trackResult.originLocation?.locationContactAndAddress?.address?.postalCode || ''
      },
      destination: {
        city: trackResult.destinationLocation?.locationContactAndAddress?.address?.city || '',
        state: trackResult.destinationLocation?.locationContactAndAddress?.address?.stateOrProvinceCode || '',
        country: trackResult.destinationLocation?.locationContactAndAddress?.address?.countryCode || '',
        postalCode: trackResult.destinationLocation?.locationContactAndAddress?.address?.postalCode || ''
      },
      service: trackResult.serviceDetail?.description || trackResult.serviceType || '',
      weight: trackResult.packageDetails?.weightAndDimensions?.weight?.[0]?.value,
      events,
      isException,
      exceptionReason: isException ? latestStatus?.statusByLocale : undefined,
      signedBy: trackResult.deliveryDetails?.receivedByName,
      // Reference fields
      shipperReference,
      poNumber,
      invoiceNumber,
      customerReference,
      shipperName,
      recipientName
    };
  } catch (error) {
    console.error('FedEx tracking error:', error);
    return null;
  }
}

/**
 * Track multiple FedEx packages at once
 */
export async function trackMultiplePackages(trackingNumbers: string[]): Promise<FedExPackage[]> {
  const results: FedExPackage[] = [];
  
  // FedEx allows up to 30 tracking numbers per request
  const chunks = [];
  for (let i = 0; i < trackingNumbers.length; i += 30) {
    chunks.push(trackingNumbers.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    try {
      const token = await getAccessToken();
      
      const response = await fetch(
        `${FEDEX_CONFIG.baseUrl}/track/v1/trackingnumbers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-locale': 'en_US'
          },
          body: JSON.stringify({
            includeDetailedScans: true,
            trackingInfo: chunk.map(tn => ({
              trackingNumberInfo: { trackingNumber: tn }
            }))
          })
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const trackResults = data.output?.completeTrackResults || [];

      for (const result of trackResults) {
        const trackResult = result.trackResults?.[0];
        if (!trackResult) continue;

        const latestStatus = trackResult.latestStatusDetail;
        const scanEvents = trackResult.scanEvents || [];

        const events: FedExTrackingEvent[] = scanEvents.slice(0, 5).map((scan: any) => ({
          date: scan.date?.split('T')[0] || '',
          time: scan.date?.split('T')[1]?.substring(0, 8) || '',
          location: `${scan.scanLocation?.city || ''}, ${scan.scanLocation?.stateOrProvinceCode || ''}`,
          status: scan.eventType || '',
          description: scan.eventDescription || ''
        }));

        results.push({
          trackingNumber: trackResult.trackingNumberInfo?.trackingNumber || '',
          status: latestStatus?.code || 'Unknown',
          statusDescription: latestStatus?.statusByLocale || 'Unknown',
          origin: {
            city: trackResult.originLocation?.locationContactAndAddress?.address?.city || '',
            state: trackResult.originLocation?.locationContactAndAddress?.address?.stateOrProvinceCode || '',
            country: '',
            postalCode: ''
          },
          destination: {
            city: trackResult.destinationLocation?.locationContactAndAddress?.address?.city || '',
            state: trackResult.destinationLocation?.locationContactAndAddress?.address?.stateOrProvinceCode || '',
            country: '',
            postalCode: ''
          },
          service: trackResult.serviceDetail?.description || '',
          events,
          isException: latestStatus?.code === 'DE' || latestStatus?.code === 'SE'
        });
      }
    } catch (error) {
      console.error('FedEx batch tracking error:', error);
    }
  }

  return results;
}

/**
 * Check if FedEx integration is configured
 */
export function isConfigured(): boolean {
  return !!(FEDEX_CONFIG.apiKey && FEDEX_CONFIG.secretKey);
}

/**
 * Get configuration status
 */
export function getConfigStatus() {
  return {
    configured: isConfigured(),
    hasApiKey: !!FEDEX_CONFIG.apiKey,
    hasSecretKey: !!FEDEX_CONFIG.secretKey,
    accountCount: FEDEX_CONFIG.accountNumbers.length
  };
}

/**
 * Check if tracking number is FedEx format
 */
export function isFedExTracking(tracking: string): boolean {
  const cleaned = tracking.trim();
  // FedEx tracking numbers are typically 12, 15, 20, or 22 digits
  // Door tags are 12 digits
  // Express/Ground are 12-15 digits
  // SmartPost are 20-22 digits
  return /^\d{12,22}$/.test(cleaned) || 
         /^\d{4}\s?\d{4}\s?\d{4}$/.test(cleaned); // Formatted 12-digit
}

