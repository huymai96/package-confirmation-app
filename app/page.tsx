'use client';

import { useState, useEffect } from 'react';
import { 
  Search, Package, ArrowDownToLine, ArrowUpFromLine, 
  CheckCircle, XCircle, Truck, Clock, AlertTriangle,
  MapPin, Calendar, Building2, RefreshCw, Filter,
  Download, Upload, FileSpreadsheet, Play, Loader2
} from 'lucide-react';

interface InboundInfo {
  scanned: boolean;
  scanTimestamp?: string;
  scanStatus?: string;
  poNumber?: string;
  customer?: string;
  upsStatus?: string;
  shipper?: string;
}

interface OutboundInfo {
  found: boolean;
  recipient?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  service?: string;
  reference?: string;
  location?: string;
  station?: string;
  carrier?: string;
}

interface TrackingEvent {
  date: string;
  time: string;
  location: string;
  status: string;
  description: string;
}

interface UPSLiveData {
  status: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  location?: string;
  isException: boolean;
  exceptionReason?: string;
  weight?: string;
  service?: string;
  events: TrackingEvent[];
  // Reference fields
  shipperReference?: string;
  poNumber?: string;
  invoiceNumber?: string;
  shipperName?: string;
  recipientName?: string;
}

interface FedExLiveData {
  status: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  location?: string;
  isException: boolean;
  exceptionReason?: string;
  weight?: string;
  service?: string;
  signedBy?: string;
  events: TrackingEvent[];
  // Reference fields
  shipperReference?: string;
  poNumber?: string;
  invoiceNumber?: string;
  shipperName?: string;
  recipientName?: string;
  customerReference?: string;
  origin?: { city: string; state: string; country: string; postalCode: string };
  destination?: { city: string; state: string; country: string; postalCode: string };
}

interface PackageResult {
  found: boolean;
  type: 'inbound' | 'outbound' | 'both' | 'none';
  tracking: string;
  carrier?: 'UPS' | 'FedEx';
  inbound?: InboundInfo;
  outbound?: OutboundInfo;
  message: string;
  upsLive?: UPSLiveData;
  fedexLive?: FedExLiveData;
  quantumView?: {
    trackingNumber: string;
    status: string;
    origin: { city: string; state: string; postalCode: string };
    destination: { city: string; state: string; postalCode: string };
  };
}

interface RecentScan {
  tracking: string;
  po: string;
  timestamp: string;
  status: string;
}

interface RecentOutbound {
  tracking: string;
  recipient: string;
  location: string;
  service: string;
}

interface InboundShipment {
  tracking: string;
  origin: string;
  status: string;
  shipDate: string;
  service: string;
  lastActivity: string;
}

interface QVStats {
  totalEvents: number;
  totalShipments: number;
}

interface BatchResult {
  tracking: string;
  carrier: string;
  status: string;
  statusDescription: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  service?: string;
  origin?: string;
  destination?: string;
  signedBy?: string;
  isException: boolean;
  poNumber?: string;
  shipperReference?: string;
  shipperName?: string;
  error?: string;
}

interface BatchStats {
  total: number;
  delivered: number;
  inTransit: number;
  exceptions: number;
  unknown: number;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [result, setResult] = useState<PackageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [recentOutbound, setRecentOutbound] = useState<RecentOutbound[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'inbound' | 'outbound' | 'quantum' | 'batch'>('search');
  const [stats, setStats] = useState({ inboundTotal: 0, outboundTotal: 0 });
  const [qvStats, setQvStats] = useState<QVStats>({ totalEvents: 0, totalShipments: 0 });
  const [inboundResults, setInboundResults] = useState<InboundShipment[]>([]);
  const [inboundLoading, setInboundLoading] = useState(false);
  
  // Batch tracking state
  const [batchInput, setBatchInput] = useState('');
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchStats, setBatchStats] = useState<BatchStats | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  useEffect(() => {
    fetchRecent();
    fetchStats();
    fetchQVStats();
  }, []);

  const fetchRecent = async () => {
    try {
      const [inRes, outRes] = await Promise.all([
        fetch('/api/lookup?recent=true'),
        fetch('/api/lookup?recentOutbound=true')
      ]);
      setRecentScans(await inRes.json());
      setRecentOutbound(await outRes.json());
    } catch (error) {
      console.error('Error fetching recent:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/lookup?stats=true');
      setStats(await res.json());
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchQVStats = async () => {
    try {
      const res = await fetch('/api/webhooks/ups?action=events');
      const data = await res.json();
      setQvStats({ totalEvents: data.totalEvents || 0, totalShipments: data.totalShipments || 0 });
    } catch (error) {
      console.error('Error fetching QV stats:', error);
    }
  };

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    
    setLoading(true);
    setQuery(q);
    setActiveTab('search');
    try {
      const res = await fetch(`/api/lookup?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      setResult(data);
    } catch (error) {
      console.error('Error searching:', error);
      setResult({
        found: false,
        type: 'none',
        tracking: q,
        message: '❌ Error searching - please try again'
      });
    } finally {
      setLoading(false);
    }
  };

  // Batch tracking function
  const handleBatchTrack = async () => {
    if (!batchInput.trim()) return;
    
    setBatchLoading(true);
    setBatchResults([]);
    setBatchStats(null);
    
    try {
      const res = await fetch('/api/batch-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingList: batchInput })
      });
      const data = await res.json();
      setBatchResults(data.results || []);
      setBatchStats(data.stats || null);
    } catch (error) {
      console.error('Batch tracking error:', error);
    } finally {
      setBatchLoading(false);
    }
  };

  // Export to CSV function
  const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => 
        headers.map(h => {
          const val = row[h];
          if (val === null || val === undefined) return '""';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const searchInboundByOrigin = async () => {
    if (!originZip.trim()) return;
    
    setInboundLoading(true);
    try {
      const res = await fetch(`/api/inbound?originZip=${encodeURIComponent(originZip.trim())}`);
      const data = await res.json();
      setInboundResults(data.shipments || []);
      setActiveTab('quantum');
    } catch (error) {
      console.error('Error searching inbound:', error);
    } finally {
      setInboundLoading(false);
    }
  };

  const getResultColor = () => {
    if (!result) return '';
    if (result.type === 'both') return 'bg-purple-50 border-purple-300';
    if (result.type === 'inbound') return 'bg-blue-50 border-blue-300';
    if (result.type === 'outbound') return 'bg-green-50 border-green-300';
    return 'bg-red-50 border-red-300';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900">
      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-2xl">
                <Package className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Promos Ink Supply Chain</h1>
                <p className="text-indigo-200 text-sm">Enterprise Shipment Visibility Platform</p>
              </div>
            </div>
            <button 
              onClick={() => { fetchRecent(); fetchStats(); fetchQVStats(); }}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <div className="bg-blue-500/20 backdrop-blur-sm rounded-2xl p-4 border border-blue-400/30">
            <div className="flex items-center gap-3">
              <ArrowDownToLine className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-blue-200 text-xs">Inbound Scans</p>
                <p className="text-2xl font-bold text-white">{stats.inboundTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-green-500/20 backdrop-blur-sm rounded-2xl p-4 border border-green-400/30">
            <div className="flex items-center gap-3">
              <ArrowUpFromLine className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-green-200 text-xs">Outbound</p>
                <p className="text-2xl font-bold text-white">{stats.outboundTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
          
          {/* Batch Stats - Show when batch results exist */}
          {batchStats ? (
            <>
              <div className="bg-emerald-500/20 backdrop-blur-sm rounded-2xl p-4 border border-emerald-400/30">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                  <div>
                    <p className="text-emerald-200 text-xs">Delivered</p>
                    <p className="text-2xl font-bold text-white">{batchStats.delivered}</p>
                  </div>
                </div>
              </div>
              <div className="bg-cyan-500/20 backdrop-blur-sm rounded-2xl p-4 border border-cyan-400/30">
                <div className="flex items-center gap-3">
                  <Truck className="w-8 h-8 text-cyan-400" />
                  <div>
                    <p className="text-cyan-200 text-xs">In Transit</p>
                    <p className="text-2xl font-bold text-white">{batchStats.inTransit}</p>
                  </div>
                </div>
              </div>
              <div className="bg-red-500/20 backdrop-blur-sm rounded-2xl p-4 border border-red-400/30">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-8 h-8 text-red-400" />
                  <div>
                    <p className="text-red-200 text-xs">Exceptions</p>
                    <p className="text-2xl font-bold text-white">{batchStats.exceptions}</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-500/20 backdrop-blur-sm rounded-2xl p-4 border border-gray-400/30">
                <div className="flex items-center gap-3">
                  <Package className="w-8 h-8 text-gray-400" />
                  <div>
                    <p className="text-gray-200 text-xs">Batch Total</p>
                    <p className="text-2xl font-bold text-white">{batchStats.total}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-amber-500/20 backdrop-blur-sm rounded-2xl p-4 border border-amber-400/30">
                <div className="flex items-center gap-3">
                  <Truck className="w-8 h-8 text-amber-400" />
                  <div>
                    <p className="text-amber-200 text-xs">UPS Quantum View</p>
                    <p className="text-2xl font-bold text-white">{qvStats.totalShipments}</p>
                  </div>
                </div>
              </div>
              <div className="bg-purple-500/20 backdrop-blur-sm rounded-2xl p-4 border border-purple-400/30">
                <div className="flex items-center gap-3">
                  <Building2 className="w-8 h-8 text-purple-400" />
                  <div>
                    <p className="text-purple-200 text-xs">Warehouses</p>
                    <p className="text-2xl font-bold text-white">FB1 & FB2</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Main Search Area */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Tracking Search */}
          <div className="bg-white rounded-2xl shadow-xl p-5">
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-2">
              <Search className="w-5 h-5" /> Search Tracking # or PO #
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="1Z90A10R0306936706 or 84379144"
                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-gray-900"
              />
              <button
                onClick={() => handleSearch()}
                disabled={loading || !query.trim()}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold rounded-xl transition-all flex items-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {/* Origin/Supplier Search */}
          <div className="bg-white rounded-2xl shadow-xl p-5">
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-2">
              <MapPin className="w-5 h-5" /> Search Inbound by Origin ZIP
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={originZip}
                onChange={(e) => setOriginZip(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchInboundByOrigin()}
                placeholder="e.g. 76107 (Fort Worth)"
                className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-amber-500 transition-colors text-gray-900"
              />
              <button
                onClick={searchInboundByOrigin}
                disabled={inboundLoading || !originZip.trim()}
                className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold rounded-xl transition-all flex items-center gap-2"
              >
                {inboundLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Filter className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">Find shipments coming FROM a supplier location</p>
          </div>
        </div>

        {/* Search Result */}
        {result && activeTab === 'search' && (
          <div className={`rounded-2xl shadow-xl p-6 mb-6 border-2 ${getResultColor()}`}>
            {/* Result Header */}
            <div className="flex items-center gap-4 mb-4">
              {result.type === 'inbound' && <ArrowDownToLine className="w-12 h-12 text-blue-600" />}
              {result.type === 'outbound' && <ArrowUpFromLine className="w-12 h-12 text-green-600" />}
              {result.type === 'both' && <Package className="w-12 h-12 text-purple-600" />}
              {result.type === 'none' && <XCircle className="w-12 h-12 text-red-600" />}
              <div>
                <p className="text-2xl font-bold text-gray-800">{result.message}</p>
                <p className="font-mono text-gray-600">{result.tracking}</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Inbound Details */}
              {result.inbound && (
                <div className="bg-blue-100/50 rounded-xl p-4">
                  <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                    <ArrowDownToLine className="w-5 h-5" /> Inbound Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {result.inbound.scanned && (
                      <>
                        <div>
                          <p className="text-blue-600 text-xs">Scan Time</p>
                          <p className="font-bold text-gray-800">{result.inbound.scanTimestamp}</p>
                        </div>
                        <div>
                          <p className="text-blue-600 text-xs">Status</p>
                          <p className="font-bold text-gray-800">{result.inbound.scanStatus}</p>
                        </div>
                      </>
                    )}
                    {result.inbound.poNumber && (
                      <div>
                        <p className="text-blue-600 text-xs">PO #</p>
                        <p className="font-bold text-gray-800">{result.inbound.poNumber}</p>
                      </div>
                    )}
                    {result.inbound.customer && (
                      <div>
                        <p className="text-blue-600 text-xs">Customer</p>
                        <p className="font-bold text-gray-800">{result.inbound.customer}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Outbound Details */}
              {result.outbound && (
                <div className="bg-green-100/50 rounded-xl p-4">
                  <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                    <ArrowUpFromLine className="w-5 h-5" /> Outbound Details
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-green-600 text-xs">From</p>
                      <p className="font-bold text-gray-800">{result.outbound.location || 'Quantum View'}</p>
                    </div>
                    <div>
                      <p className="text-green-600 text-xs">Service</p>
                      <p className="font-bold text-gray-800">{result.outbound.service || 'UPS'}</p>
                    </div>
                    {result.outbound.recipient && (
                      <div>
                        <p className="text-green-600 text-xs">Recipient</p>
                        <p className="font-bold text-gray-800">{result.outbound.recipient}</p>
                      </div>
                    )}
                    {result.outbound.city && (
                      <div>
                        <p className="text-green-600 text-xs">Destination</p>
                        <p className="font-bold text-gray-800">{result.outbound.city}, {result.outbound.state}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Quantum View Data */}
              {result.quantumView && (
                <div className="bg-amber-100/50 rounded-xl p-4">
                  <h3 className="font-bold text-amber-800 mb-2 flex items-center gap-2">
                    <Truck className="w-5 h-5" /> Quantum View
                  </h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-amber-600 text-xs">Status</p>
                      <p className="font-bold text-gray-800">{result.quantumView.status}</p>
                    </div>
                    <div>
                      <p className="text-amber-600 text-xs">Origin</p>
                      <p className="font-bold text-gray-800">
                        {result.quantumView.origin?.city}, {result.quantumView.origin?.state}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* UPS Live Tracking */}
              {result.upsLive && (
                <div className={`rounded-xl p-4 ${result.upsLive.isException ? 'bg-red-100/50' : 'bg-amber-100/50'}`}>
                  <h3 className={`font-bold mb-2 flex items-center gap-2 ${result.upsLive.isException ? 'text-red-800' : 'text-amber-800'}`}>
                    <Truck className="w-5 h-5" /> 
                    <span className="bg-amber-700 text-white text-xs px-2 py-0.5 rounded">UPS</span>
                    Live Tracking
                    {result.upsLive.isException && (
                      <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full ml-1">EXCEPTION</span>
                    )}
                    {result.upsLive.status?.toLowerCase().includes('delivered') && (
                      <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full ml-1">DELIVERED</span>
                    )}
                  </h3>
                  
                  {/* Reference Numbers - Prominent Display */}
                  {(result.upsLive.poNumber || result.upsLive.invoiceNumber || result.upsLive.shipperReference) && (
                    <div className="bg-amber-200/50 rounded-lg p-2 mb-3 border border-amber-300">
                      <p className="text-amber-800 text-xs font-semibold mb-1">📋 Reference Info</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {result.upsLive.poNumber && (
                          <div>
                            <span className="text-amber-700 text-xs">PO#:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.upsLive.poNumber}</span>
                          </div>
                        )}
                        {result.upsLive.invoiceNumber && (
                          <div>
                            <span className="text-amber-700 text-xs">Invoice#:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.upsLive.invoiceNumber}</span>
                          </div>
                        )}
                        {result.upsLive.shipperReference && (
                          <div className="col-span-2">
                            <span className="text-amber-700 text-xs">Reference:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.upsLive.shipperReference}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Shipper/Recipient Names */}
                  {(result.upsLive.shipperName || result.upsLive.recipientName) && (
                    <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                      {result.upsLive.shipperName && (
                        <div>
                          <p className="text-amber-600 text-xs">From</p>
                          <p className="font-bold text-gray-800">{result.upsLive.shipperName}</p>
                        </div>
                      )}
                      {result.upsLive.recipientName && (
                        <div>
                          <p className="text-amber-600 text-xs">To</p>
                          <p className="font-bold text-gray-800">{result.upsLive.recipientName}</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-amber-600 text-xs">Status</p>
                      <p className="font-bold text-gray-800">{result.upsLive.status}</p>
                    </div>
                    {result.upsLive.location && (
                      <div>
                        <p className="text-amber-600 text-xs">Location</p>
                        <p className="font-bold text-gray-800">{result.upsLive.location}</p>
                      </div>
                    )}
                    {result.upsLive.service && (
                      <div>
                        <p className="text-amber-600 text-xs">Service</p>
                        <p className="font-bold text-gray-800">{result.upsLive.service}</p>
                      </div>
                    )}
                    {result.upsLive.estimatedDelivery && (
                      <div>
                        <p className="text-amber-600 text-xs">Est. Delivery</p>
                        <p className="font-bold text-gray-800">{result.upsLive.estimatedDelivery}</p>
                      </div>
                    )}
                    {result.upsLive.deliveredAt && (
                      <div>
                        <p className="text-green-600 text-xs">Delivered</p>
                        <p className="font-bold text-green-700">{result.upsLive.deliveredAt}</p>
                      </div>
                    )}
                  </div>
                  {result.upsLive.events && result.upsLive.events.length > 0 && (
                    <div className="border-t border-amber-200 pt-2 mt-2">
                      <p className="text-amber-700 text-xs font-semibold mb-1">Recent Activity</p>
                      {result.upsLive.events.slice(0, 3).map((event, idx) => (
                        <div key={idx} className="text-xs text-gray-700">
                          • {event.description} - {event.location}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* FedEx Live Tracking */}
              {result.fedexLive && (
                <div className={`rounded-xl p-4 ${result.fedexLive.isException ? 'bg-red-100/50' : 'bg-purple-100/50'}`}>
                  <h3 className={`font-bold mb-2 flex items-center gap-2 ${result.fedexLive.isException ? 'text-red-800' : 'text-purple-800'}`}>
                    <Truck className="w-5 h-5" /> 
                    <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded">FedEx</span>
                    Live Tracking
                    {result.fedexLive.isException && (
                      <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full ml-1">EXCEPTION</span>
                    )}
                    {result.fedexLive.status?.toLowerCase().includes('delivered') && (
                      <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full ml-1">DELIVERED</span>
                    )}
                  </h3>

                  {/* Reference Numbers - Prominent Display */}
                  {(result.fedexLive.poNumber || result.fedexLive.invoiceNumber || result.fedexLive.shipperReference || result.fedexLive.customerReference) && (
                    <div className="bg-purple-200/50 rounded-lg p-2 mb-3 border border-purple-300">
                      <p className="text-purple-800 text-xs font-semibold mb-1">📋 Reference Info</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {result.fedexLive.poNumber && (
                          <div>
                            <span className="text-purple-700 text-xs">PO#:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.fedexLive.poNumber}</span>
                          </div>
                        )}
                        {result.fedexLive.invoiceNumber && (
                          <div>
                            <span className="text-purple-700 text-xs">Invoice#:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.fedexLive.invoiceNumber}</span>
                          </div>
                        )}
                        {result.fedexLive.shipperReference && (
                          <div>
                            <span className="text-purple-700 text-xs">Shipper Ref:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.fedexLive.shipperReference}</span>
                          </div>
                        )}
                        {result.fedexLive.customerReference && (
                          <div>
                            <span className="text-purple-700 text-xs">Customer Ref:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.fedexLive.customerReference}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Shipper/Recipient Names & Origin/Destination */}
                  <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
                    {(result.fedexLive.shipperName || result.fedexLive.origin?.city) && (
                      <div>
                        <p className="text-purple-600 text-xs">From</p>
                        <p className="font-bold text-gray-800">
                          {result.fedexLive.shipperName || `${result.fedexLive.origin?.city}, ${result.fedexLive.origin?.state || result.fedexLive.origin?.country}`}
                        </p>
                        {result.fedexLive.shipperName && result.fedexLive.origin?.city && (
                          <p className="text-gray-600 text-xs">{result.fedexLive.origin.city}, {result.fedexLive.origin.state || result.fedexLive.origin.country}</p>
                        )}
                      </div>
                    )}
                    {(result.fedexLive.recipientName || result.fedexLive.destination?.city) && (
                      <div>
                        <p className="text-purple-600 text-xs">To</p>
                        <p className="font-bold text-gray-800">
                          {result.fedexLive.recipientName || `${result.fedexLive.destination?.city}, ${result.fedexLive.destination?.state}`}
                        </p>
                        {result.fedexLive.recipientName && result.fedexLive.destination?.city && (
                          <p className="text-gray-600 text-xs">{result.fedexLive.destination.city}, {result.fedexLive.destination.state}</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-purple-600 text-xs">Status</p>
                      <p className="font-bold text-gray-800">{result.fedexLive.status}</p>
                    </div>
                    {result.fedexLive.location && (
                      <div>
                        <p className="text-purple-600 text-xs">Last Location</p>
                        <p className="font-bold text-gray-800">{result.fedexLive.location}</p>
                      </div>
                    )}
                    {result.fedexLive.service && (
                      <div>
                        <p className="text-purple-600 text-xs">Service</p>
                        <p className="font-bold text-gray-800">{result.fedexLive.service}</p>
                      </div>
                    )}
                    {result.fedexLive.weight && (
                      <div>
                        <p className="text-purple-600 text-xs">Weight</p>
                        <p className="font-bold text-gray-800">{result.fedexLive.weight} lbs</p>
                      </div>
                    )}
                    {result.fedexLive.estimatedDelivery && !result.fedexLive.deliveredAt && (
                      <div>
                        <p className="text-purple-600 text-xs">Est. Delivery</p>
                        <p className="font-bold text-gray-800">{result.fedexLive.estimatedDelivery}</p>
                      </div>
                    )}
                    {result.fedexLive.deliveredAt && (
                      <div>
                        <p className="text-green-600 text-xs">Delivered</p>
                        <p className="font-bold text-green-700">{result.fedexLive.deliveredAt}</p>
                      </div>
                    )}
                    {result.fedexLive.signedBy && (
                      <div>
                        <p className="text-green-600 text-xs">Signed By</p>
                        <p className="font-bold text-green-700">{result.fedexLive.signedBy}</p>
                      </div>
                    )}
                  </div>
                  {result.fedexLive.events && result.fedexLive.events.length > 0 && (
                    <div className="border-t border-purple-200 pt-2 mt-2">
                      <p className="text-purple-700 text-xs font-semibold mb-1">Recent Activity</p>
                      {result.fedexLive.events.slice(0, 4).map((event, idx) => (
                        <div key={idx} className="text-xs text-gray-700 flex items-start gap-1">
                          <span className="text-purple-400">•</span>
                          <span>{event.date} {event.time?.substring(0,5)} - {event.description}</span>
                          {event.location && <span className="text-gray-500">({event.location})</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inbound Search Results */}
        {activeTab === 'quantum' && inboundResults.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-amber-500" /> 
              Inbound from ZIP: {originZip}
              <span className="ml-2 px-2 py-1 bg-amber-100 text-amber-700 text-sm rounded-full">
                {inboundResults.length} shipments
              </span>
            </h3>
            <div className="space-y-2">
              {inboundResults.map((ship, i) => (
                <div 
                  key={i}
                  onClick={() => handleSearch(ship.tracking)}
                  className="p-3 bg-amber-50 hover:bg-amber-100 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-mono font-bold text-gray-800">{ship.tracking}</p>
                      <p className="text-sm text-gray-600">From: {ship.origin}</p>
                    </div>
                    <div className="text-right">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        ship.status === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                        ship.status?.includes('EXCEPTION') ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {ship.status}
                      </span>
                      {ship.lastActivity && (
                        <p className="text-xs text-gray-500 mt-1">{ship.lastActivity}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('inbound')}
              className={`flex-1 px-4 py-3 font-semibold flex items-center justify-center gap-2 transition-colors text-sm ${
                activeTab === 'inbound' 
                  ? 'bg-blue-500/20 text-blue-300 border-b-2 border-blue-400' 
                  : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" />
              Recent Inbound
            </button>
            <button
              onClick={() => setActiveTab('outbound')}
              className={`flex-1 px-4 py-3 font-semibold flex items-center justify-center gap-2 transition-colors text-sm ${
                activeTab === 'outbound' 
                  ? 'bg-green-500/20 text-green-300 border-b-2 border-green-400' 
                  : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4" />
              Recent Outbound
            </button>
            <button
              onClick={() => setActiveTab('quantum')}
              className={`flex-1 px-4 py-3 font-semibold flex items-center justify-center gap-2 transition-colors text-sm ${
                activeTab === 'quantum' 
                  ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400' 
                  : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <Truck className="w-4 h-4" />
              Quantum View
            </button>
            <button
              onClick={() => setActiveTab('batch')}
              className={`flex-1 px-4 py-3 font-semibold flex items-center justify-center gap-2 transition-colors text-sm ${
                activeTab === 'batch' 
                  ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-400' 
                  : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              Batch Track
            </button>
          </div>

          <div className="p-4 max-h-96 overflow-y-auto">
            {activeTab === 'inbound' && (
              <div className="space-y-2">
                {recentScans.length === 0 ? (
                  <p className="text-white/40 text-center py-8">No recent inbound scans</p>
                ) : (
                  recentScans.map((scan, i) => (
                    <button
                      key={`${scan.tracking}-${i}`}
                      onClick={() => handleSearch(scan.tracking)}
                      className="w-full text-left p-3 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono text-white text-sm">{scan.tracking}</p>
                          {scan.po && <p className="text-blue-300 text-xs">PO: {scan.po}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-white/60 text-xs">{scan.timestamp}</p>
                          <span className="inline-block px-2 py-0.5 bg-blue-500/30 text-blue-300 text-xs rounded-full">
                            {scan.status}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {activeTab === 'outbound' && (
              <div className="space-y-2">
                {recentOutbound.length === 0 ? (
                  <p className="text-white/40 text-center py-8">No recent outbound shipments</p>
                ) : (
                  recentOutbound.map((ship, i) => (
                    <button
                      key={`${ship.tracking}-${i}`}
                      onClick={() => handleSearch(ship.tracking)}
                      className="w-full text-left p-3 bg-green-500/10 hover:bg-green-500/20 rounded-xl transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-mono text-white text-sm">{ship.tracking}</p>
                          <p className="text-green-300 text-xs">To: {ship.recipient}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-2 py-0.5 bg-green-500/30 text-green-300 text-xs rounded-full">
                            {ship.location}
                          </span>
                          <p className="text-white/60 text-xs mt-1">{ship.service}</p>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {activeTab === 'quantum' && (
              <div className="space-y-4">
                {qvStats.totalShipments === 0 && inboundResults.length === 0 ? (
                  <div className="text-center py-8">
                    <Truck className="w-12 h-12 text-white/20 mx-auto mb-3" />
                    <p className="text-white/40">Waiting for UPS Quantum View events...</p>
                    <p className="text-white/30 text-sm mt-2">Events will appear when UPS sends shipment updates</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-amber-500/20 rounded-xl p-3">
                        <p className="text-amber-300 text-xs">Total Events</p>
                        <p className="text-2xl font-bold text-white">{qvStats.totalEvents}</p>
                      </div>
                      <div className="bg-amber-500/20 rounded-xl p-3">
                        <p className="text-amber-300 text-xs">Tracked Shipments</p>
                        <p className="text-2xl font-bold text-white">{qvStats.totalShipments}</p>
                      </div>
                    </div>
                    {inboundResults.length > 0 && (
                      <div className="space-y-2">
                        {inboundResults.map((ship, i) => (
                          <button
                            key={i}
                            onClick={() => handleSearch(ship.tracking)}
                            className="w-full text-left p-3 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-mono text-white text-sm">{ship.tracking}</p>
                                <p className="text-amber-300 text-xs">From: {ship.origin}</p>
                              </div>
                              <span className="px-2 py-0.5 bg-amber-500/30 text-amber-300 text-xs rounded-full">
                                {ship.status}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Batch Tracking Tab */}
            {activeTab === 'batch' && (
              <div className="space-y-4">
                {/* Batch Input */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-white text-sm font-semibold">
                      Paste tracking numbers (one per line or comma-separated)
                    </label>
                    <span className="text-white/40 text-xs">Max 50</span>
                  </div>
                  <textarea
                    value={batchInput}
                    onChange={(e) => setBatchInput(e.target.value)}
                    placeholder="1Z90A10R0306936706&#10;886094855396&#10;1Z90A10R0307410478"
                    className="w-full h-32 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-cyan-400 font-mono text-sm"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleBatchTrack}
                      disabled={batchLoading || !batchInput.trim()}
                      className="flex-1 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-gray-500 disabled:to-gray-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {batchLoading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                      {batchLoading ? 'Tracking...' : 'Track All'}
                    </button>
                    {batchResults.length > 0 && (
                      <button
                        onClick={() => exportToCSV(batchResults, 'batch-tracking')}
                        className="px-4 py-3 bg-green-500/20 hover:bg-green-500/30 text-green-300 font-semibold rounded-xl transition-colors flex items-center gap-2"
                      >
                        <Download className="w-5 h-5" />
                        Export CSV
                      </button>
                    )}
                  </div>
                </div>

                {/* Batch Results */}
                {batchStats && (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-emerald-500/20 rounded-lg p-2">
                      <p className="text-emerald-300 text-xs">Delivered</p>
                      <p className="text-xl font-bold text-white">{batchStats.delivered}</p>
                    </div>
                    <div className="bg-cyan-500/20 rounded-lg p-2">
                      <p className="text-cyan-300 text-xs">In Transit</p>
                      <p className="text-xl font-bold text-white">{batchStats.inTransit}</p>
                    </div>
                    <div className="bg-red-500/20 rounded-lg p-2">
                      <p className="text-red-300 text-xs">Exceptions</p>
                      <p className="text-xl font-bold text-white">{batchStats.exceptions}</p>
                    </div>
                    <div className="bg-gray-500/20 rounded-lg p-2">
                      <p className="text-gray-300 text-xs">Unknown</p>
                      <p className="text-xl font-bold text-white">{batchStats.unknown}</p>
                    </div>
                  </div>
                )}

                {batchResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {batchResults.map((result, i) => (
                      <button
                        key={i}
                        onClick={() => handleSearch(result.tracking)}
                        className={`w-full text-left p-3 rounded-xl transition-colors ${
                          result.statusDescription?.toLowerCase().includes('delivered')
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20'
                            : result.isException
                            ? 'bg-red-500/10 hover:bg-red-500/20'
                            : 'bg-cyan-500/10 hover:bg-cyan-500/20'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                result.carrier === 'UPS' ? 'bg-amber-600 text-white' : 'bg-purple-600 text-white'
                              }`}>
                                {result.carrier}
                              </span>
                              <p className="font-mono text-white text-sm">{result.tracking}</p>
                            </div>
                            <p className="text-white/60 text-xs mt-1">
                              {result.origin} → {result.destination}
                            </p>
                            {result.poNumber && (
                              <p className="text-cyan-300 text-xs">PO: {result.poNumber}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              result.statusDescription?.toLowerCase().includes('delivered')
                                ? 'bg-emerald-500/30 text-emerald-300'
                                : result.isException
                                ? 'bg-red-500/30 text-red-300'
                                : 'bg-cyan-500/30 text-cyan-300'
                            }`}>
                              {result.statusDescription}
                            </span>
                            {result.deliveredAt && (
                              <p className="text-emerald-300 text-xs mt-1">{result.deliveredAt}</p>
                            )}
                            {result.signedBy && (
                              <p className="text-white/50 text-xs">Signed: {result.signedBy}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {!batchLoading && batchResults.length === 0 && (
                  <div className="text-center py-8">
                    <FileSpreadsheet className="w-12 h-12 text-white/20 mx-auto mb-3" />
                    <p className="text-white/40">Paste tracking numbers above</p>
                    <p className="text-white/30 text-sm mt-2">Track up to 50 packages at once • UPS & FedEx supported</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => exportToCSV(recentScans, 'inbound-scans')}
            disabled={recentScans.length === 0}
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-500/10 disabled:text-gray-500 text-blue-300 rounded-xl transition-colors flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Export Inbound CSV
          </button>
          <button
            onClick={() => exportToCSV(recentOutbound, 'outbound-shipments')}
            disabled={recentOutbound.length === 0}
            className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-gray-500/10 disabled:text-gray-500 text-green-300 rounded-xl transition-colors flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Export Outbound CSV
          </button>
        </div>
      </main>

      <footer className="text-center py-4 text-white/40 text-sm border-t border-white/10 mt-8">
        <p>Promos Ink Supply Chain Platform • FB1 & FB2 Warehouses • Dallas, TX</p>
        <p className="text-xs mt-1">Inbound scans sync every 5 min • UPS Quantum View • Real-time tracking</p>
      </footer>
    </div>
  );
}
