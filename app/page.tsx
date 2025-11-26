'use client';

import { useState, useEffect } from 'react';
import { Search, Package, ArrowDownToLine, ArrowUpFromLine, CheckCircle, XCircle, Truck, Clock } from 'lucide-react';

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

interface PackageResult {
  found: boolean;
  type: 'inbound' | 'outbound' | 'both' | 'none';
  tracking: string;
  inbound?: InboundInfo;
  outbound?: OutboundInfo;
  message: string;
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

export default function Home() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PackageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [recentOutbound, setRecentOutbound] = useState<RecentOutbound[]>([]);
  const [activeTab, setActiveTab] = useState<'inbound' | 'outbound'>('inbound');
  const [stats, setStats] = useState({ inboundTotal: 0, outboundTotal: 0 });

  useEffect(() => {
    fetchRecent();
    fetchStats();
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

  const handleSearch = async (searchQuery?: string) => {
    const q = searchQuery || query;
    if (!q.trim()) return;
    
    setLoading(true);
    setQuery(q);
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
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-2xl">
              <Package className="w-10 h-10 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Package Tracker</h1>
              <p className="text-indigo-200">Inbound & Outbound Shipment Lookup</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-blue-500/20 backdrop-blur-sm rounded-2xl p-4 border border-blue-400/30">
            <div className="flex items-center gap-3">
              <ArrowDownToLine className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-blue-200 text-sm">Inbound Scans</p>
                <p className="text-2xl font-bold text-white">{stats.inboundTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-green-500/20 backdrop-blur-sm rounded-2xl p-4 border border-green-400/30">
            <div className="flex items-center gap-3">
              <ArrowUpFromLine className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-green-200 text-sm">Outbound Shipments</p>
                <p className="text-2xl font-bold text-white">{stats.outboundTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search Box */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 mb-6">
          <label className="block text-gray-700 text-lg font-semibold mb-3">
            🔍 Search Tracking # or PO #
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. 1Z90A10R0306936706 or 84379144"
              className="flex-1 px-5 py-4 text-lg border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-gray-900"
              autoFocus
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading || !query.trim()}
              className="px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold rounded-xl transition-all flex items-center gap-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Search className="w-6 h-6" />
              )}
              Search
            </button>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`rounded-3xl shadow-xl p-6 mb-6 border-2 ${getResultColor()}`}>
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

            {/* Inbound Details */}
            {result.inbound && (
              <div className="bg-blue-100/50 rounded-xl p-4 mb-4">
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
                        <p className="text-blue-600 text-xs">Scan Status</p>
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
                  {result.inbound.upsStatus && (
                    <div>
                      <p className="text-blue-600 text-xs">UPS Status</p>
                      <p className="font-bold text-gray-800">{result.inbound.upsStatus}</p>
                    </div>
                  )}
                  {result.inbound.shipper && (
                    <div className="col-span-2">
                      <p className="text-blue-600 text-xs">Shipper</p>
                      <p className="font-bold text-gray-800">{result.inbound.shipper}</p>
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
                    <p className="text-green-600 text-xs">Shipped From</p>
                    <p className="font-bold text-gray-800">{result.outbound.location} - {result.outbound.station}</p>
                  </div>
                  <div>
                    <p className="text-green-600 text-xs">Service</p>
                    <p className="font-bold text-gray-800">{result.outbound.service}</p>
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
                      <p className="font-bold text-gray-800">{result.outbound.city}, {result.outbound.state} {result.outbound.zip}</p>
                    </div>
                  )}
                  {result.outbound.reference && (
                    <div className="col-span-2">
                      <p className="text-green-600 text-xs">Reference</p>
                      <p className="font-bold text-gray-800">{result.outbound.reference}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs for Recent Activity */}
        <div className="bg-white/10 backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden">
          {/* Tab Headers */}
          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('inbound')}
              className={`flex-1 px-6 py-4 font-semibold flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'inbound' 
                  ? 'bg-blue-500/20 text-blue-300 border-b-2 border-blue-400' 
                  : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <ArrowDownToLine className="w-5 h-5" />
              Recent Inbound
            </button>
            <button
              onClick={() => setActiveTab('outbound')}
              className={`flex-1 px-6 py-4 font-semibold flex items-center justify-center gap-2 transition-colors ${
                activeTab === 'outbound' 
                  ? 'bg-green-500/20 text-green-300 border-b-2 border-green-400' 
                  : 'text-white/60 hover:bg-white/5'
              }`}
            >
              <ArrowUpFromLine className="w-5 h-5" />
              Recent Outbound
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4 max-h-80 overflow-y-auto">
            {activeTab === 'inbound' ? (
              <div className="space-y-2">
                {recentScans.map((scan, i) => (
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
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {recentOutbound.map((ship, i) => (
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
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="text-center py-6 text-white/40 text-sm">
        Inbound scans sync every 5 min • Outbound from FB1 & FB2 shipping stations
      </footer>
    </div>
  );
}
