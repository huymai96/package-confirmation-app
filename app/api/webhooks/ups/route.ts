import { NextResponse } from 'next/server';
import { put, list, del } from '@vercel/blob';

// Quantum View event types
interface QVShipment {
  trackingNumber: string;
  shipperNumber: string;
  shipDate: string;
  scheduledDeliveryDate?: string;
  service: string;
  weight: string;
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
    companyName?: string;
    attentionName?: string;
  };
  referenceNumbers?: string[];
  currentStatus?: string;
  lastActivity?: {
    date: string;
    time: string;
    location: string;
    description: string;
  };
}

interface QVEvent {
  eventType: 'MANIFEST' | 'ORIGIN' | 'DELIVERY' | 'EXCEPTION' | 'GENERIC';
  shipments: QVShipment[];
  subscriberID: string;
  timestamp: string;
}

// Store Quantum View data
async function storeQVEvent(event: QVEvent) {
  try {
    // Read existing QV data
    const { blobs } = await list();
    const qvBlob = blobs.find(b => b.pathname === 'quantum-view-events.json');
    
    let existingData: { events: QVEvent[]; shipments: Record<string, QVShipment> } = {
      events: [],
      shipments: {}
    };
    
    if (qvBlob) {
      const response = await fetch(qvBlob.url);
      if (response.ok) {
        existingData = await response.json();
      }
      await del(qvBlob.url);
    }
    
    // Add new event
    existingData.events.unshift(event);
    
    // Keep only last 1000 events
    if (existingData.events.length > 1000) {
      existingData.events = existingData.events.slice(0, 1000);
    }
    
    // Update shipment map for quick lookup
    for (const shipment of event.shipments) {
      existingData.shipments[shipment.trackingNumber.toLowerCase()] = shipment;
    }
    
    // Save updated data
    await put('quantum-view-events.json', JSON.stringify(existingData), {
      access: 'public',
      contentType: 'application/json'
    });
    
    return { success: true, shipmentsProcessed: event.shipments.length };
  } catch (error) {
    console.error('Error storing QV event:', error);
    return { success: false, error: String(error) };
  }
}

// Webhook endpoint for UPS Quantum View
export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    console.log('Received UPS Quantum View webhook:', JSON.stringify(body).slice(0, 500));
    
    // Parse UPS Quantum View format
    // UPS sends data in various formats depending on subscription type
    
    let event: QVEvent;
    
    // Handle different UPS webhook formats
    if (body.QuantumViewEvents) {
      // Standard Quantum View format
      const qvEvents = body.QuantumViewEvents;
      
      event = {
        eventType: qvEvents.SubscriptionEvents?.SubscriptionEventType || 'GENERIC',
        subscriberID: qvEvents.SubscriberID || 'unknown',
        timestamp: new Date().toISOString(),
        shipments: []
      };
      
      // Parse shipments from various QV subscription types
      const subscriptionEvents = qvEvents.SubscriptionEvents;
      
      if (subscriptionEvents?.SubscriptionFile?.Manifest) {
        // Manifest events (outbound shipments)
        const manifests = Array.isArray(subscriptionEvents.SubscriptionFile.Manifest) 
          ? subscriptionEvents.SubscriptionFile.Manifest 
          : [subscriptionEvents.SubscriptionFile.Manifest];
          
        for (const manifest of manifests) {
          if (manifest.Package) {
            const packages = Array.isArray(manifest.Package) ? manifest.Package : [manifest.Package];
            for (const pkg of packages) {
              event.shipments.push({
                trackingNumber: pkg.TrackingNumber || '',
                shipperNumber: manifest.ShipperNumber || '',
                shipDate: manifest.PickupDate || '',
                service: manifest.Service?.Description || '',
                weight: pkg.PackageWeight?.Weight || '',
                origin: {
                  city: manifest.Shipper?.Address?.City || '',
                  state: manifest.Shipper?.Address?.StateProvinceCode || '',
                  country: manifest.Shipper?.Address?.CountryCode || '',
                  postalCode: manifest.Shipper?.Address?.PostalCode || ''
                },
                destination: {
                  city: manifest.ShipTo?.Address?.City || '',
                  state: manifest.ShipTo?.Address?.StateProvinceCode || '',
                  country: manifest.ShipTo?.Address?.CountryCode || '',
                  postalCode: manifest.ShipTo?.Address?.PostalCode || '',
                  companyName: manifest.ShipTo?.CompanyName || '',
                  attentionName: manifest.ShipTo?.AttentionName || ''
                },
                referenceNumbers: pkg.ReferenceNumber?.map((r: { Value: string }) => r.Value) || []
              });
            }
          }
        }
        event.eventType = 'MANIFEST';
      }
      
      if (subscriptionEvents?.SubscriptionFile?.Origin) {
        // Origin scan events (package picked up)
        const origins = Array.isArray(subscriptionEvents.SubscriptionFile.Origin)
          ? subscriptionEvents.SubscriptionFile.Origin
          : [subscriptionEvents.SubscriptionFile.Origin];
          
        for (const origin of origins) {
          event.shipments.push({
            trackingNumber: origin.TrackingNumber || '',
            shipperNumber: origin.ShipperNumber || '',
            shipDate: origin.PickupDate || '',
            service: origin.Service?.Description || '',
            weight: origin.PackageWeight?.Weight || '',
            origin: {
              city: origin.ActivityLocation?.City || '',
              state: origin.ActivityLocation?.StateProvinceCode || '',
              country: origin.ActivityLocation?.CountryCode || '',
              postalCode: origin.ActivityLocation?.PostalCode || ''
            },
            destination: {
              city: origin.ShipTo?.Address?.City || '',
              state: origin.ShipTo?.Address?.StateProvinceCode || '',
              country: origin.ShipTo?.Address?.CountryCode || '',
              postalCode: origin.ShipTo?.Address?.PostalCode || ''
            },
            currentStatus: 'ORIGIN_SCAN',
            lastActivity: {
              date: origin.Date || '',
              time: origin.Time || '',
              location: `${origin.ActivityLocation?.City || ''}, ${origin.ActivityLocation?.StateProvinceCode || ''}`,
              description: 'Origin Scan'
            }
          });
        }
        event.eventType = 'ORIGIN';
      }
      
      if (subscriptionEvents?.SubscriptionFile?.Delivery) {
        // Delivery events
        const deliveries = Array.isArray(subscriptionEvents.SubscriptionFile.Delivery)
          ? subscriptionEvents.SubscriptionFile.Delivery
          : [subscriptionEvents.SubscriptionFile.Delivery];
          
        for (const delivery of deliveries) {
          event.shipments.push({
            trackingNumber: delivery.TrackingNumber || '',
            shipperNumber: delivery.ShipperNumber || '',
            shipDate: delivery.PickupDate || '',
            service: delivery.Service?.Description || '',
            weight: delivery.PackageWeight?.Weight || '',
            origin: {
              city: '',
              state: '',
              country: '',
              postalCode: ''
            },
            destination: {
              city: delivery.DeliveryLocation?.City || '',
              state: delivery.DeliveryLocation?.StateProvinceCode || '',
              country: delivery.DeliveryLocation?.CountryCode || '',
              postalCode: delivery.DeliveryLocation?.PostalCode || '',
              companyName: delivery.ShipTo?.CompanyName || ''
            },
            currentStatus: 'DELIVERED',
            lastActivity: {
              date: delivery.Date || '',
              time: delivery.Time || '',
              location: `${delivery.DeliveryLocation?.City || ''}, ${delivery.DeliveryLocation?.StateProvinceCode || ''}`,
              description: delivery.DeliveryLocation?.SignedForByName 
                ? `Delivered - Signed by ${delivery.DeliveryLocation.SignedForByName}`
                : 'Delivered'
            }
          });
        }
        event.eventType = 'DELIVERY';
      }
      
      if (subscriptionEvents?.SubscriptionFile?.Exception) {
        // Exception events
        const exceptions = Array.isArray(subscriptionEvents.SubscriptionFile.Exception)
          ? subscriptionEvents.SubscriptionFile.Exception
          : [subscriptionEvents.SubscriptionFile.Exception];
          
        for (const exception of exceptions) {
          event.shipments.push({
            trackingNumber: exception.TrackingNumber || '',
            shipperNumber: exception.ShipperNumber || '',
            shipDate: exception.PickupDate || '',
            service: exception.Service?.Description || '',
            weight: exception.PackageWeight?.Weight || '',
            origin: {
              city: '',
              state: '',
              country: '',
              postalCode: ''
            },
            destination: {
              city: exception.ShipTo?.Address?.City || '',
              state: exception.ShipTo?.Address?.StateProvinceCode || '',
              country: exception.ShipTo?.Address?.CountryCode || '',
              postalCode: exception.ShipTo?.Address?.PostalCode || ''
            },
            currentStatus: `EXCEPTION: ${exception.StatusType?.Description || 'Unknown'}`,
            lastActivity: {
              date: exception.Date || '',
              time: exception.Time || '',
              location: `${exception.ActivityLocation?.City || ''}, ${exception.ActivityLocation?.StateProvinceCode || ''}`,
              description: exception.StatusType?.Description || 'Exception'
            }
          });
        }
        event.eventType = 'EXCEPTION';
      }
    } else if (body.trackingNumber) {
      // Simple tracking update format
      event = {
        eventType: 'GENERIC',
        subscriberID: 'direct',
        timestamp: new Date().toISOString(),
        shipments: [{
          trackingNumber: body.trackingNumber,
          shipperNumber: body.shipperNumber || '',
          shipDate: body.shipDate || '',
          service: body.service || '',
          weight: body.weight || '',
          origin: body.origin || { city: '', state: '', country: '', postalCode: '' },
          destination: body.destination || { city: '', state: '', country: '', postalCode: '' },
          currentStatus: body.status || '',
          lastActivity: body.lastActivity
        }]
      };
    } else {
      // Unknown format - store raw for debugging
      console.log('Unknown webhook format, storing raw data');
      event = {
        eventType: 'GENERIC',
        subscriberID: 'unknown',
        timestamp: new Date().toISOString(),
        shipments: []
      };
    }
    
    // Store the event
    const result = await storeQVEvent(event);
    
    // Return success to UPS
    return NextResponse.json({
      message: 'Webhook received',
      ...result
    });
    
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent UPS from retrying
    return NextResponse.json({
      success: false,
      error: String(error)
    });
  }
}

// GET endpoint to check webhook status and view recent events
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  try {
    if (action === 'status') {
      return NextResponse.json({
        status: 'active',
        endpoint: '/api/webhooks/ups',
        message: 'UPS Quantum View webhook endpoint is ready'
      });
    }
    
    if (action === 'events') {
      // Return recent events
      const { blobs } = await list();
      const qvBlob = blobs.find(b => b.pathname === 'quantum-view-events.json');
      
      if (!qvBlob) {
        return NextResponse.json({ events: [], shipments: {} });
      }
      
      const response = await fetch(qvBlob.url);
      const data = await response.json();
      
      return NextResponse.json({
        totalEvents: data.events?.length || 0,
        totalShipments: Object.keys(data.shipments || {}).length,
        recentEvents: data.events?.slice(0, 10) || []
      });
    }
    
    // Default - return webhook info
    return NextResponse.json({
      endpoint: '/api/webhooks/ups',
      methods: ['POST', 'GET'],
      status: 'ready',
      actions: {
        'GET ?action=status': 'Check webhook status',
        'GET ?action=events': 'View recent events',
        'POST': 'Receive UPS Quantum View events'
      }
    });
    
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

