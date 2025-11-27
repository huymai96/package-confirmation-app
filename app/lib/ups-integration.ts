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

// Quantum View subscription names (configured in UPS Quantum View portal)
const QV_SUBSCRIPTIONS = {
  inbound: ['PROMOS INK', 'Promos Ink Inc', '13911'],
  outbound: ['E45A82', 'W34D92', 'W34G18', 'K9Y228'],
  thirdParty: ['E45A82', 'W34D92', 'W34G18']
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
  // Reference fields
  shipperReference?: string;
  poNumber?: string;
  invoiceNumber?: string;
  shipperName?: string;
  recipientName?: string;
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

  return tokenCache!.access_token;
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

    // Extract reference numbers from UPS response
    const referenceNumbers = pkg.referenceNumber || shipment.referenceNumber || [];
    let shipperReference = '';
    let poNumber = '';
    let invoiceNumber = '';
    
    if (Array.isArray(referenceNumbers)) {
      for (const ref of referenceNumbers) {
        const code = (ref.code || ref.type || '').toUpperCase();
        const value = ref.value || ref.number || '';
        
        if (code === 'PO' || code.includes('PURCHASE')) {
          poNumber = value;
        } else if (code === 'IN' || code.includes('INVOICE')) {
          invoiceNumber = value;
        } else if (code === 'SH' || code.includes('SHIPPER')) {
          shipperReference = value;
        } else if (!shipperReference && value) {
          shipperReference = value;
        }
      }
    }

    // Get shipper and recipient names
    const shipperName = shipment.shipper?.companyName || shipment.shipper?.name || '';
    const recipientName = shipment.shipTo?.companyName || shipment.shipTo?.name || '';

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
      exceptionReason: isException ? currentStatus?.status?.description : undefined,
      // Reference fields
      shipperReference,
      poNumber,
      invoiceNumber,
      shipperName,
      recipientName
    };
  } catch (error) {
    console.error('UPS tracking error:', error);
    return null;
  }
}

/**
 * Get Quantum View data for all subscriptions
 * Uses the Quantum View Response API to retrieve subscription data
 */
export async function getQuantumViewData(): Promise<QuantumViewShipment[]> {
  try {
    const token = await getAccessToken();
    const allShipments: QuantumViewShipment[] = [];

    // Get all unique subscription names
    const allSubscriptions = [
      ...QV_SUBSCRIPTIONS.inbound.map(name => ({ name, direction: 'inbound' as const })),
      ...QV_SUBSCRIPTIONS.outbound.map(name => ({ name, direction: 'outbound' as const })),
      ...QV_SUBSCRIPTIONS.thirdParty.map(name => ({ name, direction: 'inbound' as const })) // 3rd party treated as inbound
    ];
    
    // Remove duplicates
    const uniqueSubs = allSubscriptions.filter((item, index, self) =>
      index === self.findIndex(t => t.name === item.name)
    );

    for (const { name: subscriptionName, direction } of uniqueSubs) {
      if (!subscriptionName.trim()) continue;

      // Use Quantum View Response API
      const response = await fetch(
        `${UPS_CONFIG.baseUrl}/api/quantumview/v1/response`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'transId': `qv-${Date.now()}`,
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
                Name: subscriptionName.trim(),
                DateTimeRange: {
                  BeginDateTime: getDateOffset(-7),
                  EndDateTime: getDateOffset(0)
                }
              }
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Quantum View failed for ${subscriptionName}: ${response.status} - ${errorText}`);
        continue;
      }
      
      const accountNumber = subscriptionName;

      const data = await response.json();
      
      // Parse Quantum View Response
      const qvResponse = data.QuantumViewResponse;
      if (!qvResponse) continue;

      // Process subscription files
      const subscriptionEvents = qvResponse.QuantumViewEvents?.SubscriptionEvents;
      if (!subscriptionEvents) continue;

      const subscriptionFiles = subscriptionEvents.SubscriptionFile || [];
      const files = Array.isArray(subscriptionFiles) ? subscriptionFiles : [subscriptionFiles];

      for (const file of files) {
        // Process Manifest (Outbound - labels created)
        if (file.Manifest) {
          const manifests = Array.isArray(file.Manifest) ? file.Manifest : [file.Manifest];
          for (const manifest of manifests) {
            const packages = manifest.Package ? (Array.isArray(manifest.Package) ? manifest.Package : [manifest.Package]) : [];
            for (const pkg of packages) {
              allShipments.push({
                trackingNumber: pkg.TrackingNumber || '',
                shipperName: manifest.Shipper?.Name || '',
                shipperAddress: `${manifest.Shipper?.Address?.City || ''}, ${manifest.Shipper?.Address?.StateProvinceCode || ''}`,
                recipientName: manifest.ShipTo?.CompanyName || manifest.ShipTo?.AttentionName || '',
                recipientAddress: `${manifest.ShipTo?.Address?.City || ''}, ${manifest.ShipTo?.Address?.StateProvinceCode || ''}`,
                scheduledDelivery: pkg.ScheduledDeliveryDate || '',
                status: 'MANIFEST',
                direction: 'outbound',
                accountNumber
              });
            }
          }
        }

        // Process Origin (Outbound - picked up)
        if (file.Origin) {
          const origins = Array.isArray(file.Origin) ? file.Origin : [file.Origin];
          for (const origin of origins) {
            allShipments.push({
              trackingNumber: origin.TrackingNumber || '',
              shipperName: origin.Shipper?.Name || '',
              shipperAddress: `${origin.ActivityLocation?.City || ''}, ${origin.ActivityLocation?.StateProvinceCode || ''}`,
              recipientName: origin.ShipTo?.CompanyName || '',
              recipientAddress: `${origin.ShipTo?.Address?.City || ''}, ${origin.ShipTo?.Address?.StateProvinceCode || ''}`,
              scheduledDelivery: origin.ScheduledDeliveryDate || '',
              status: 'ORIGIN_SCAN',
              direction: 'outbound',
              accountNumber
            });
          }
        }

        // Process Delivery (Delivered packages)
        if (file.Delivery) {
          const deliveries = Array.isArray(file.Delivery) ? file.Delivery : [file.Delivery];
          for (const delivery of deliveries) {
            allShipments.push({
              trackingNumber: delivery.TrackingNumber || '',
              shipperName: delivery.Shipper?.Name || '',
              shipperAddress: '',
              recipientName: delivery.ShipTo?.CompanyName || '',
              recipientAddress: `${delivery.DeliveryLocation?.City || ''}, ${delivery.DeliveryLocation?.StateProvinceCode || ''}`,
              scheduledDelivery: '',
              status: 'DELIVERED',
              direction: 'outbound',
              accountNumber
            });
          }
        }

        // Process Exception
        if (file.Exception) {
          const exceptions = Array.isArray(file.Exception) ? file.Exception : [file.Exception];
          for (const exception of exceptions) {
            allShipments.push({
              trackingNumber: exception.TrackingNumber || '',
              shipperName: exception.Shipper?.Name || '',
              shipperAddress: '',
              recipientName: exception.ShipTo?.CompanyName || '',
              recipientAddress: `${exception.ShipTo?.Address?.City || ''}, ${exception.ShipTo?.Address?.StateProvinceCode || ''}`,
              scheduledDelivery: '',
              status: `EXCEPTION: ${exception.StatusType?.Description || 'Unknown'}`,
              direction: 'outbound',
              accountNumber
            });
          }
        }

        // Process Generic (Inbound and other events)
        if (file.Generic) {
          const generics = Array.isArray(file.Generic) ? file.Generic : [file.Generic];
          for (const generic of generics) {
            // Determine direction based on ship-to address matching our warehouses
            const destCity = generic.ShipTo?.Address?.City?.toUpperCase() || '';
            const destZip = generic.ShipTo?.Address?.PostalCode || '';
            const isInbound = destCity === 'DALLAS' && (destZip === '75234' || destZip.startsWith('75234'));
            
            allShipments.push({
              trackingNumber: generic.TrackingNumber || '',
              shipperName: generic.Shipper?.Name || '',
              shipperAddress: `${generic.Shipper?.Address?.City || ''}, ${generic.Shipper?.Address?.StateProvinceCode || ''}`,
              recipientName: generic.ShipTo?.CompanyName || '',
              recipientAddress: `${generic.ShipTo?.Address?.City || ''}, ${generic.ShipTo?.Address?.StateProvinceCode || ''}`,
              scheduledDelivery: generic.ScheduledDeliveryDate || '',
              status: generic.ActivityType || 'IN_TRANSIT',
              direction: isInbound ? 'inbound' : 'outbound',
              accountNumber
            });
          }
        }
      }
    }

    return allShipments;
  } catch (error) {
    console.error('Quantum View error:', error);
    return [];
  }
}

// Helper to get date in UPS format (YYYYMMDDHHMMSS)
function getDateOffset(daysOffset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}000000`;
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

