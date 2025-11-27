'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  X, MapPin, Truck, Clock, CheckCircle, AlertTriangle, 
  Package, Printer, Download, ChevronDown, ChevronUp,
  Building2, Calendar, FileText, ArrowRight
} from 'lucide-react';

interface TrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  description: string;
}

interface TrackingDetails {
  tracking: string;
  carrier: 'UPS' | 'FedEx';
  status: string;
  statusDescription?: string;
  isException: boolean;
  exceptionReason?: string;
  origin?: { city: string; state: string; country?: string; postalCode?: string };
  destination?: { city: string; state: string; country?: string; postalCode?: string };
  shipDate?: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  service?: string;
  weight?: string;
  signedBy?: string;
  poNumber?: string;
  invoiceNumber?: string;
  shipperReference?: string;
  shipperName?: string;
  recipientName?: string;
  events: TrackingEvent[];
}

interface TrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracking: string;
  carrier: 'UPS' | 'FedEx';
}

export default function TrackingModal({ isOpen, onClose, tracking, carrier }: TrackingModalProps) {
  const [details, setDetails] = useState<TrackingDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && tracking) {
      fetchTrackingDetails();
    }
  }, [isOpen, tracking]);

  const fetchTrackingDetails = async () => {
    setLoading(true);
    try {
      const endpoint = carrier === 'UPS' 
        ? `/api/ups?tracking=${tracking}`
        : `/api/fedex?tracking=${tracking}`;
      
      const res = await fetch(endpoint);
      const data = await res.json();
      
      if (data.found !== false) {
        setDetails({
          tracking,
          carrier,
          status: data.status || 'Unknown',
          statusDescription: data.statusDescription,
          isException: data.isException || false,
          exceptionReason: data.exceptionReason,
          origin: data.origin,
          destination: data.destination,
          shipDate: data.shipDate,
          deliveredAt: data.actualDelivery || data.deliveredAt,
          estimatedDelivery: data.estimatedDelivery,
          service: data.service,
          weight: data.weight,
          signedBy: data.signedBy,
          poNumber: data.poNumber,
          invoiceNumber: data.invoiceNumber,
          shipperReference: data.shipperReference || data.customerReference,
          shipperName: data.shipperName,
          recipientName: data.recipientName,
          events: data.events || []
        });
      }
    } catch (error) {
      console.error('Error fetching tracking details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Tracking Details - ${tracking}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .tracking-number { font-size: 24px; font-weight: bold; font-family: monospace; }
          .carrier-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; margin-left: 10px; }
          .ups { background: #FFB500; color: #351C15; }
          .fedex { background: #4D148C; color: white; }
          .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 20px; }
          .info-item { padding: 10px; background: #f5f5f5; border-radius: 4px; }
          .info-label { font-size: 12px; color: #666; }
          .info-value { font-weight: bold; font-size: 14px; }
          .timeline { border-left: 3px solid #ddd; margin-left: 10px; padding-left: 20px; }
          .event { margin-bottom: 15px; position: relative; }
          .event::before { content: ''; position: absolute; left: -26px; top: 5px; width: 10px; height: 10px; background: #666; border-radius: 50%; }
          .event.delivered::before { background: #22c55e; }
          .event.exception::before { background: #ef4444; }
          .event-date { font-weight: bold; }
          .event-location { color: #666; font-size: 12px; }
          .event-desc { font-size: 14px; }
          .route { display: flex; align-items: center; gap: 20px; margin: 20px 0; padding: 15px; background: #f0f0f0; border-radius: 8px; }
          .route-point { text-align: center; }
          .route-arrow { font-size: 24px; color: #666; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <span class="tracking-number">${details?.tracking}</span>
          <span class="carrier-badge ${carrier.toLowerCase()}">${carrier}</span>
        </div>
        
        <div class="route">
          <div class="route-point">
            <div style="font-weight: bold;">ORIGIN</div>
            <div>${details?.origin?.city || 'N/A'}, ${details?.origin?.state || ''}</div>
            ${details?.shipperName ? `<div style="font-size: 12px; color: #666;">${details.shipperName}</div>` : ''}
          </div>
          <div class="route-arrow">→</div>
          <div class="route-point">
            <div style="font-weight: bold;">DESTINATION</div>
            <div>${details?.destination?.city || 'Dallas'}, ${details?.destination?.state || 'TX'}</div>
            ${details?.recipientName ? `<div style="font-size: 12px; color: #666;">${details.recipientName}</div>` : ''}
          </div>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Status</div>
            <div class="info-value">${details?.statusDescription || details?.status}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Service</div>
            <div class="info-value">${details?.service || 'N/A'}</div>
          </div>
          ${details?.poNumber ? `
          <div class="info-item">
            <div class="info-label">PO Number</div>
            <div class="info-value">${details.poNumber}</div>
          </div>
          ` : ''}
          ${details?.invoiceNumber ? `
          <div class="info-item">
            <div class="info-label">Invoice</div>
            <div class="info-value">${details.invoiceNumber}</div>
          </div>
          ` : ''}
          ${details?.shipperReference ? `
          <div class="info-item">
            <div class="info-label">Reference</div>
            <div class="info-value">${details.shipperReference}</div>
          </div>
          ` : ''}
          ${details?.deliveredAt ? `
          <div class="info-item">
            <div class="info-label">Delivered</div>
            <div class="info-value" style="color: #22c55e;">${details.deliveredAt}</div>
          </div>
          ` : ''}
          ${details?.estimatedDelivery && !details?.deliveredAt ? `
          <div class="info-item">
            <div class="info-label">Est. Delivery</div>
            <div class="info-value">${details.estimatedDelivery}</div>
          </div>
          ` : ''}
          ${details?.signedBy ? `
          <div class="info-item">
            <div class="info-label">Signed By</div>
            <div class="info-value">${details.signedBy}</div>
          </div>
          ` : ''}
        </div>

        <h3>Tracking History</h3>
        <div class="timeline">
          ${details?.events?.map((e, i) => `
            <div class="event ${e.description?.toLowerCase().includes('delivered') ? 'delivered' : e.description?.toLowerCase().includes('exception') ? 'exception' : ''}">
              <div class="event-date">${e.date} ${e.time || ''}</div>
              <div class="event-location">${e.location}</div>
              <div class="event-desc">${e.description}</div>
            </div>
          `).join('') || '<div>No events available</div>'}
        </div>

        <div style="margin-top: 30px; font-size: 11px; color: #999; border-top: 1px solid #ddd; padding-top: 10px;">
          Printed from Promos Ink Supply Chain Platform • ${new Date().toLocaleString()}
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (!isOpen) return null;

  const carrierColor = carrier === 'UPS' ? 'amber' : 'purple';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        ref={printRef}
        className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${carrier === 'UPS' ? 'from-amber-500 to-amber-600' : 'from-purple-500 to-purple-600'} p-4`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-white/80 text-sm">Tracking Number</p>
                <p className="font-mono text-xl font-bold text-white">{tracking}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                carrier === 'UPS' ? 'bg-amber-900 text-amber-100' : 'bg-purple-900 text-purple-100'
              }`}>
                {carrier}
              </span>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : details ? (
            <div className="space-y-6">
              {/* Route Visualization */}
              <div className={`bg-gradient-to-r ${carrier === 'UPS' ? 'from-amber-50 to-orange-50' : 'from-purple-50 to-indigo-50'} rounded-xl p-6`}>
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-lg mb-2">
                      <Building2 className={`w-8 h-8 ${carrier === 'UPS' ? 'text-amber-600' : 'text-purple-600'}`} />
                    </div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Origin</p>
                    <p className="font-bold text-gray-800">
                      {details.origin?.city || 'Unknown'}, {details.origin?.state || ''}
                    </p>
                    {details.shipperName && (
                      <p className="text-sm text-gray-600">{details.shipperName}</p>
                    )}
                    {details.origin?.postalCode && (
                      <p className="text-xs text-gray-400 font-mono">{details.origin.postalCode}</p>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col items-center px-4">
                    <div className="w-full h-1 bg-gradient-to-r from-gray-300 via-gray-400 to-gray-300 rounded-full relative">
                      <Truck className={`absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 ${
                        details.deliveredAt ? 'text-green-500' : carrier === 'UPS' ? 'text-amber-500' : 'text-purple-500'
                      }`} />
                    </div>
                    <p className={`mt-4 px-3 py-1 rounded-full text-sm font-semibold ${
                      details.deliveredAt 
                        ? 'bg-green-100 text-green-700' 
                        : details.isException 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {details.statusDescription || details.status}
                    </p>
                  </div>

                  <div className="text-center flex-1">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto shadow-lg mb-2">
                      <MapPin className={`w-8 h-8 ${details.deliveredAt ? 'text-green-600' : 'text-gray-400'}`} />
                    </div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Destination</p>
                    <p className="font-bold text-gray-800">
                      {details.destination?.city || 'Dallas'}, {details.destination?.state || 'TX'}
                    </p>
                    {details.recipientName && (
                      <p className="text-sm text-gray-600">{details.recipientName}</p>
                    )}
                    {details.destination?.postalCode && (
                      <p className="text-xs text-gray-400 font-mono">{details.destination.postalCode}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Reference Information */}
              {(details.poNumber || details.invoiceNumber || details.shipperReference) && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <h4 className="font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Reference Information
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    {details.poNumber && (
                      <div>
                        <p className="text-xs text-gray-500">PO Number</p>
                        <p className="font-bold text-gray-900">{details.poNumber}</p>
                      </div>
                    )}
                    {details.invoiceNumber && (
                      <div>
                        <p className="text-xs text-gray-500">Invoice</p>
                        <p className="font-bold text-gray-900">{details.invoiceNumber}</p>
                      </div>
                    )}
                    {details.shipperReference && (
                      <div>
                        <p className="text-xs text-gray-500">Reference</p>
                        <p className="font-bold text-gray-900">{details.shipperReference}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Delivery Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <Calendar className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-500">Ship Date</p>
                  <p className="font-bold text-gray-800">{details.shipDate || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center">
                  <Truck className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                  <p className="text-xs text-gray-500">Service</p>
                  <p className="font-bold text-gray-800 text-sm">{details.service || 'Standard'}</p>
                </div>
                {details.deliveredAt ? (
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
                    <p className="text-xs text-green-600">Delivered</p>
                    <p className="font-bold text-green-700">{details.deliveredAt}</p>
                  </div>
                ) : details.estimatedDelivery ? (
                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <Clock className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                    <p className="text-xs text-blue-600">Est. Delivery</p>
                    <p className="font-bold text-blue-700">{details.estimatedDelivery}</p>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <Clock className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <p className="text-xs text-gray-500">Est. Delivery</p>
                    <p className="font-bold text-gray-800">Pending</p>
                  </div>
                )}
                {details.signedBy && (
                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <CheckCircle className="w-5 h-5 text-green-500 mx-auto mb-1" />
                    <p className="text-xs text-green-600">Signed By</p>
                    <p className="font-bold text-green-700">{details.signedBy}</p>
                  </div>
                )}
                {details.weight && (
                  <div className="bg-gray-50 rounded-xl p-4 text-center">
                    <Package className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                    <p className="text-xs text-gray-500">Weight</p>
                    <p className="font-bold text-gray-800">{details.weight} lbs</p>
                  </div>
                )}
              </div>

              {/* Exception Alert */}
              {details.isException && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-red-700">Exception Alert</p>
                    <p className="text-red-600 text-sm">
                      {details.exceptionReason || 'This shipment has an exception. Please contact carrier for details.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Full Event Timeline */}
              <div className="border rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedEvents(!expandedEvents)}
                  className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
                >
                  <span className="font-bold text-gray-700 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Tracking History ({details.events.length} events)
                  </span>
                  {expandedEvents ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                
                {expandedEvents && (
                  <div className="p-4 max-h-80 overflow-y-auto">
                    {details.events.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No tracking events available</p>
                    ) : (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />
                        
                        {details.events.map((event, idx) => {
                          const isDelivered = event.description?.toLowerCase().includes('delivered');
                          const isException = event.description?.toLowerCase().includes('exception') || 
                                            event.description?.toLowerCase().includes('delay');
                          
                          return (
                            <div key={idx} className="relative pl-10 pb-4 last:pb-0">
                              {/* Timeline dot */}
                              <div className={`absolute left-1.5 top-1 w-4 h-4 rounded-full border-2 ${
                                isDelivered 
                                  ? 'bg-green-500 border-green-500' 
                                  : isException 
                                  ? 'bg-red-500 border-red-500'
                                  : idx === 0 
                                  ? `bg-${carrierColor}-500 border-${carrierColor}-500`
                                  : 'bg-white border-gray-300'
                              }`} />
                              
                              <div className={`${idx === 0 ? 'bg-gray-50' : ''} rounded-lg p-2`}>
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-semibold text-gray-900">{event.date}</span>
                                  {event.time && (
                                    <span className="text-gray-500">{event.time}</span>
                                  )}
                                </div>
                                <p className={`font-medium ${
                                  isDelivered ? 'text-green-700' : isException ? 'text-red-700' : 'text-gray-800'
                                }`}>
                                  {event.description}
                                </p>
                                {event.location && (
                                  <p className="text-sm text-gray-500 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> {event.location}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Unable to load tracking details</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t bg-gray-50 px-6 py-4 flex justify-between items-center">
          <a
            href={carrier === 'UPS' 
              ? `https://www.ups.com/track?tracknum=${tracking}`
              : `https://www.fedex.com/fedextrack/?trknbr=${tracking}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-medium ${carrier === 'UPS' ? 'text-amber-600 hover:text-amber-700' : 'text-purple-600 hover:text-purple-700'}`}
          >
            View on {carrier}.com →
          </a>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={onClose}
              className={`px-4 py-2 ${carrier === 'UPS' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-purple-500 hover:bg-purple-600'} text-white rounded-lg transition-colors`}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

