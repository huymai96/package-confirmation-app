/**
 * UPS Quantum View Integration
 * 
 * This module integrates with UPS APIs to provide:
 * - Real-time package tracking
 * - Quantum View inbound/outbound visibility
 * - Exception alerts
 */

// UPS API Configuration (to be set via environment variables)
const UPS_CONFIG = {
  clientId: process.env.UPS_CLIENT_ID || '',
  clientSecret: process.env.UPS_CLIENT_SECRET || '',
  accountNumbers: (process.env.UPS_ACCOUNT_NUMBERS || '').split(','),
  baseUrl: 'https://onlinetools.ups.com',
  tokenUrl: 'https://onlinetools.ups.com/security/v1/oauth/token'
};

interface UPSToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  issued_at: number;
}

interface UPSTrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  description: string;
}

interface UPSPackage {
  trackingNumber: string;
  status: string;
  statusDescription: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  origin: {
    city: string;
    state: string;
    country: string;
  };
  destination: {
    city: string;
    state: string;
    country: string;
  };
  service: string;
  weight?: string;
  events: UPSTrackingEvent[];
  isException: boolean;
  exceptionReason?: string;
}

interface QuantumViewShipment {
  trackingNumber: string;
  shipperName: string;
  shipperAddress: string;
  recipientName: string;
  recipientAddress: string;
  scheduledDelivery: string;
  status: string;
  direction: 'inbound' | 'outbound';
  accountNumber: string;
}

// Token cache
let tokenCache: UPSToken | null = null;

/**
 * Get OAuth access token from UPS
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
  const credentials = Buffer.from(`${UPS_CONFIG.clientId}:${UPS_CONFIG.clientSecret}`).toString('base64');
  
  const response = await fetch(UPS_CONFIG.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    throw new Error(`UPS OAuth failed: ${response.status}`);
  }

  const data = await response.json();
  tokenCache = {
    ...data,
    issued_at: Date.now()
  };

  return tokenCache.access_token;
}

/**
 * Track a single UPS package
 */
export async function trackPackage(trackingNumber: string): Promise<UPSPackage | null> {
  try {
    const token = await getAccessToken();
    
    const response = await fetch(
      `${UPS_CONFIG.baseUrl}/api/track/v1/details/${trackingNumber}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'transId': `track-${Date.now()}`,
          'transactionSrc': 'PromoInkSupplyChain'
        }
      }
    );

    if (!response.ok) {
      console.error(`UPS Tracking failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    // Parse UPS response into our format
    const shipment = data.trackResponse?.shipment?.[0];
    if (!shipment) return null;

    const pkg = shipment.package?.[0];
    if (!pkg) return null;

    const activity = pkg.activity || [];
    const currentStatus = activity[0];
    
    const events: UPSTrackingEvent[] = activity.map((act: any) => ({
      date: act.date || '',
      time: act.time || '',
      location: `${act.location?.address?.city || ''}, ${act.location?.address?.stateProvince || ''}`,
      status: act.status?.type || '',
      description: act.status?.description || ''
    }));

    const isException = currentStatus?.status?.type === 'X';

    return {
      trackingNumber,
      status: currentStatus?.status?.type || 'Unknown',
      statusDescription: currentStatus?.status?.description || 'Unknown',
      estimatedDelivery: pkg.deliveryDate?.[0]?.date,
      actualDelivery: pkg.deliveryTime?.endTime,
      origin: {
        city: shipment.shipper?.address?.city || '',
        state: shipment.shipper?.address?.stateProvince || '',
        country: shipment.shipper?.address?.country || ''
      },
      destination: {
        city: shipment.shipTo?.address?.city || '',
        state: shipment.shipTo?.address?.stateProvince || '',
        country: shipment.shipTo?.address?.country || ''
      },
      service: shipment.service?.description || '',
      weight: pkg.weight?.weight,
      events,
      isException,
      exceptionReason: isException ? currentStatus?.status?.description : undefined
    };
  } catch (error) {
    console.error('UPS tracking error:', error);
    return null;
  }
}

/**
 * Get Quantum View data for all accounts
 * This retrieves inbound and outbound shipments visibility
 */
export async function getQuantumViewData(): Promise<QuantumViewShipment[]> {
  try {
    const token = await getAccessToken();
    const allShipments: QuantumViewShipment[] = [];

    for (const accountNumber of UPS_CONFIG.accountNumbers) {
      if (!accountNumber) continue;

      // Get Quantum View Manage data
      const response = await fetch(
        `${UPS_CONFIG.baseUrl}/api/quantum-view/v1/subscriptions/${accountNumber}/events`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'transId': `qv-${Date.now()}`,
            'transactionSrc': 'PromoInkSupplyChain'
          }
        }
      );

      if (!response.ok) {
        console.error(`Quantum View failed for ${accountNumber}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      // Parse Quantum View response
      const events = data.quantumViewEvents || [];
      for (const event of events) {
        const shipment: QuantumViewShipment = {
          trackingNumber: event.trackingNumber || '',
          shipperName: event.shipper?.name || '',
          shipperAddress: `${event.shipper?.city || ''}, ${event.shipper?.state || ''}`,
          recipientName: event.recipient?.name || '',
          recipientAddress: `${event.recipient?.city || ''}, ${event.recipient?.state || ''}`,
          scheduledDelivery: event.scheduledDeliveryDate || '',
          status: event.status || '',
          direction: event.direction === 'INBOUND' ? 'inbound' : 'outbound',
          accountNumber
        };
        allShipments.push(shipment);
      }
    }

    return allShipments;
  } catch (error) {
    console.error('Quantum View error:', error);
    return [];
  }
}

/**
 * Get inbound shipments arriving today
 */
export async function getArrivingToday(): Promise<QuantumViewShipment[]> {
  const allShipments = await getQuantumViewData();
  const today = new Date().toISOString().split('T')[0];
  
  return allShipments.filter(s => 
    s.direction === 'inbound' && 
    s.scheduledDelivery.startsWith(today)
  );
}

/**
 * Get exception shipments
 */
export async function getExceptions(): Promise<QuantumViewShipment[]> {
  const allShipments = await getQuantumViewData();
  
  return allShipments.filter(s => 
    s.status.toLowerCase().includes('exception') ||
    s.status.toLowerCase().includes('delay')
  );
}

/**
 * Check if UPS integration is configured
 */
export function isConfigured(): boolean {
  return !!(UPS_CONFIG.clientId && UPS_CONFIG.clientSecret);
}

/**
 * Get configuration status
 */
export function getConfigStatus() {
  return {
    configured: isConfigured(),
    hasClientId: !!UPS_CONFIG.clientId,
    hasClientSecret: !!UPS_CONFIG.clientSecret,
    accountCount: UPS_CONFIG.accountNumbers.filter(a => a).length
  };
}

