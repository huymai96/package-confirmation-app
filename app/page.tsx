'use client';

import { useState, useEffect } from 'react';
import { 
  Search, Package, ArrowDownToLine, ArrowUpFromLine, 
  CheckCircle, XCircle, Truck, Clock, AlertTriangle,
  MapPin, Calendar, Building2, RefreshCw, Filter,
  Download, Upload, FileSpreadsheet, Play, Loader2,
  Users, BarChart3, TrendingUp, ExternalLink, Printer, Eye,
  FolderOpen, FileUp, File, Trash2
} from 'lucide-react';
import TrackingModal from './components/TrackingModal';

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

interface QVShipment {
  trackingNumber: string;
  shipperName: string;
  shipperAddress: string;
  recipientName: string;
  recipientAddress: string;
  scheduledDelivery: string;
  status: string;
  direction: 'inbound' | 'outbound' | 'thirdparty';
  accountNumber: string;
}

interface QVData {
  inbound: QVShipment[];
  outbound: QVShipment[];
  thirdParty: QVShipment[];
  arrivingToday: QVShipment[];
  exceptions: QVShipment[];
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

interface Supplier {
  id: string;
  name: string;
  shortName: string;
  website: string;
  zipCodes: string[];
  city: string;
  state: string;
  category: string;
  contact?: { phone?: string; email?: string };
  notes?: string;
}

interface ReportData {
  summary: {
    totalInbound: number;
    totalOutbound: number;
    todayInbound: number;
    todayOutbound: number;
    lastUpdated: string;
  };
  dailyStats: Array<{
    date: string;
    inboundCount: number;
    outboundCount: number;
    deliveredCount: number;
    exceptionsCount: number;
  }>;
  performance: {
    totalShipments: number;
    avgDailyInbound: number;
    avgDailyOutbound: number;
    exceptionsToday: number;
  };
}

interface ManifestFile {
  type: string;
  filename: string;
  url: string;
  size: number;
  uploadedAt: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [result, setResult] = useState<PackageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [recentOutbound, setRecentOutbound] = useState<RecentOutbound[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'inbound' | 'outbound' | 'quantum' | 'batch' | 'suppliers' | 'reports' | 'manifests'>('search');
  const [stats, setStats] = useState({ inboundTotal: 0, outboundTotal: 0 });
  const [qvStats, setQvStats] = useState<QVStats>({ totalEvents: 0, totalShipments: 0 });
  const [inboundResults, setInboundResults] = useState<InboundShipment[]>([]);
  const [inboundLoading, setInboundLoading] = useState(false);
  
  // Batch tracking state
  const [batchInput, setBatchInput] = useState('');
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchStats, setBatchStats] = useState<BatchStats | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  
  // Quantum View state
  const [qvData, setQvData] = useState<QVData>({ inbound: [], outbound: [], thirdParty: [], arrivingToday: [], exceptions: [] });
  const [qvLoading, setQvLoading] = useState(false);
  const [qvSubTab, setQvSubTab] = useState<'inbound' | 'outbound' | 'arriving' | 'exceptions'>('inbound');
  const [qvCarrier, setQvCarrier] = useState<'ups' | 'fedex' | 'all'>('all');
  
  // FedEx Visibility state
  const [fedexData, setFedexData] = useState<QVData>({ inbound: [], outbound: [], thirdParty: [], arrivingToday: [], exceptions: [] });
  const [fedexLoading, setFedexLoading] = useState(false);

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [supplierShipments, setSupplierShipments] = useState<any[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);

  // Reports state
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Manifests state
  const [manifests, setManifests] = useState<ManifestFile[]>([]);
  const [manifestsLoading, setManifestsLoading] = useState(false);
  const [uploadingManifest, setUploadingManifest] = useState(false);
  
  // Index stats state
  const [indexStats, setIndexStats] = useState<{
    hasIndex: boolean;
    trackingCount: number;
    bySource: Record<string, number>;
    lastUpdated: string | null;
    combinedFiles: Array<{ name: string; url: string; size: number; uploadedAt: string }>;
  } | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTracking, setModalTracking] = useState('');
  const [modalCarrier, setModalCarrier] = useState<'UPS' | 'FedEx'>('UPS');

  useEffect(() => {
    fetchRecent();
    fetchStats();
    fetchQVStats();
    fetchSuppliers();
    fetchManifests();
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

  const fetchSuppliers = async () => {
    try {
      const res = await fetch('/api/suppliers?action=list');
      const data = await res.json();
      setSuppliers(data.suppliers || []);
    } catch (error) {
      console.error('Error fetching suppliers:', error);
    }
  };

  const fetchSupplierShipments = async (supplierId: string) => {
    setSupplierLoading(true);
    setSelectedSupplier(supplierId);
    try {
      const res = await fetch(`/api/suppliers?action=shipments&supplierId=${supplierId}`);
      const data = await res.json();
      setSupplierShipments(data.shipments || []);
    } catch (error) {
      console.error('Error fetching supplier shipments:', error);
    } finally {
      setSupplierLoading(false);
    }
  };

  const fetchReports = async () => {
    setReportLoading(true);
    try {
      const res = await fetch('/api/reports?action=summary&days=7');
      const data = await res.json();
      setReportData(data);
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setReportLoading(false);
    }
  };

  const fetchManifests = async () => {
    setManifestsLoading(true);
    try {
      const [manifestsRes, statsRes] = await Promise.all([
        fetch('/api/manifests?action=list'),
        fetch('/api/index-stats')
      ]);
      const manifestsData = await manifestsRes.json();
      const statsData = await statsRes.json();
      setManifests(manifestsData.manifests || []);
      setIndexStats(statsData);
    } catch (error) {
      console.error('Error fetching manifests:', error);
    } finally {
      setManifestsLoading(false);
    }
  };

  const handleManifestUpload = async (type: string, file: File) => {
    setUploadingManifest(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const res = await fetch('/api/manifests', {
        method: 'POST',
        headers: {
          'x-api-key': 'promos-ink-2024'
        },
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        alert(`${type} manifest uploaded successfully!`);
        fetchManifests();
      } else {
        alert(`Upload failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Error uploading manifest:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploadingManifest(false);
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

  const openTrackingModal = (tracking: string, carrier: 'UPS' | 'FedEx') => {
    setModalTracking(tracking);
    setModalCarrier(carrier);
    setModalOpen(true);
  };

  const detectCarrier = (tracking: string): 'UPS' | 'FedEx' => {
    const t = tracking.trim().toUpperCase();
    if (t.startsWith('1Z') || (t.length === 18 && /^\d+$/.test(t))) return 'UPS';
    return 'FedEx';
  };

  // Refresh Quantum View data from UPS
  const refreshQuantumView = async () => {
    setQvLoading(true);
    try {
      const [allRes, arrivingRes, exceptionsRes] = await Promise.all([
        fetch('/api/quantum-view?action=all'),
        fetch('/api/quantum-view?action=arriving-today'),
        fetch('/api/quantum-view?action=exceptions')
      ]);
      
      const allData = await allRes.json();
      const arrivingData = await arrivingRes.json();
      const exceptionsData = await exceptionsRes.json();
      
      setQvData({
        inbound: allData.inbound?.shipments || [],
        outbound: allData.outbound?.shipments || [],
        thirdParty: [],
        arrivingToday: arrivingData.shipments || [],
        exceptions: exceptionsData.shipments || []
      });
      
      setQvStats({
        totalEvents: (allData.inbound?.count || 0) + (allData.outbound?.count || 0),
        totalShipments: allData.total || 0
      });
    } catch (error) {
      console.error('Quantum View refresh error:', error);
    } finally {
      setQvLoading(false);
    }
  };

  // Refresh FedEx Visibility data
  const refreshFedExVisibility = async () => {
    setFedexLoading(true);
    try {
      const [allRes, arrivingRes, exceptionsRes] = await Promise.all([
        fetch('/api/fedex-visibility?action=all&limit=50'),
        fetch('/api/fedex-visibility?action=arriving-today&limit=50'),
        fetch('/api/fedex-visibility?action=exceptions&limit=50')
      ]);
      
      const allData = await allRes.json();
      const arrivingData = await arrivingRes.json();
      const exceptionsData = await exceptionsRes.json();
      
      setFedexData({
        inbound: allData.inbound?.shipments || [],
        outbound: allData.outbound?.shipments || [],
        thirdParty: [],
        arrivingToday: arrivingData.shipments || [],
        exceptions: exceptionsData.shipments || []
      });
    } catch (error) {
      console.error('FedEx Visibility refresh error:', error);
    } finally {
      setFedexLoading(false);
    }
  };

  // Refresh all carrier visibility
  const refreshAllVisibility = async () => {
    await Promise.all([refreshQuantumView(), refreshFedExVisibility()]);
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
      {/* Tracking Modal */}
      <TrackingModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        tracking={modalTracking}
        carrier={modalCarrier}
      />

      {/* Header */}
      <header className="bg-white/10 backdrop-blur-md border-b border-white/10 safe-area-top">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2 sm:p-3 rounded-xl sm:rounded-2xl flex-shrink-0">
                <Package className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-white leading-tight truncate">Promos Ink Supply Chain</h1>
                <p className="text-indigo-200 text-xs sm:text-sm truncate">Enterprise Shipment Visibility Platform</p>
              </div>
            </div>
            <button 
              onClick={() => { fetchRecent(); fetchStats(); fetchQVStats(); }}
              className="p-2 sm:p-2.5 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors flex-shrink-0"
              title="Refresh data"
              aria-label="Refresh data"
            >
              <RefreshCw className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4 mb-4 sm:mb-6">
          <div className="bg-blue-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-blue-400/30">
            <div className="flex items-center gap-2 sm:gap-3">
              <ArrowDownToLine className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-blue-200 text-[10px] sm:text-xs truncate">Inbound Scans</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{stats.inboundTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <div className="bg-green-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-green-400/30">
            <div className="flex items-center gap-2 sm:gap-3">
              <ArrowUpFromLine className="w-6 h-6 sm:w-8 sm:h-8 text-green-400 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-green-200 text-[10px] sm:text-xs truncate">Outbound</p>
                <p className="text-xl sm:text-2xl font-bold text-white">{stats.outboundTotal.toLocaleString()}</p>
              </div>
            </div>
          </div>
          
          {batchStats ? (
            <>
              <div className="bg-emerald-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-emerald-400/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-emerald-200 text-[10px] sm:text-xs">Delivered</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{batchStats.delivered}</p>
                  </div>
                </div>
              </div>
              <div className="bg-cyan-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-cyan-400/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Truck className="w-6 h-6 sm:w-8 sm:h-8 text-cyan-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-cyan-200 text-[10px] sm:text-xs">In Transit</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{batchStats.inTransit}</p>
                  </div>
                </div>
              </div>
              <div className="bg-red-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-red-400/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <AlertTriangle className="w-6 h-6 sm:w-8 sm:h-8 text-red-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-red-200 text-[10px] sm:text-xs">Exceptions</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{batchStats.exceptions}</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-400/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Package className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-gray-200 text-[10px] sm:text-xs">Batch Total</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{batchStats.total}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-amber-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-amber-400/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Truck className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-amber-200 text-[10px] sm:text-xs truncate">UPS Quantum View</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{qvStats.totalShipments}</p>
                  </div>
                </div>
              </div>
              <div className="bg-purple-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-purple-400/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Users className="w-6 h-6 sm:w-8 sm:h-8 text-purple-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-purple-200 text-[10px] sm:text-xs">Suppliers</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{suppliers.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-pink-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-pink-400/30">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Building2 className="w-6 h-6 sm:w-8 sm:h-8 text-pink-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-pink-200 text-[10px] sm:text-xs">Warehouses</p>
                    <p className="text-lg sm:text-2xl font-bold text-white">FB1 & FB2</p>
                  </div>
                </div>
              </div>
              <div className="bg-teal-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-teal-400/30 cursor-pointer hover:bg-teal-500/30 active:bg-teal-500/40 transition-colors" onClick={() => { setActiveTab('reports'); fetchReports(); }}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-teal-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-teal-200 text-[10px] sm:text-xs">Reports</p>
                    <p className="text-base sm:text-lg font-bold text-white">View →</p>
                  </div>
                </div>
              </div>
              <div className="bg-rose-500/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-rose-400/30 cursor-pointer hover:bg-rose-500/30 active:bg-rose-500/40 transition-colors" onClick={() => { setActiveTab('manifests'); fetchManifests(); }}>
                <div className="flex items-center gap-2 sm:gap-3">
                  <FolderOpen className="w-6 h-6 sm:w-8 sm:h-8 text-rose-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-rose-200 text-[10px] sm:text-xs">Manifests</p>
                    <p className="text-base sm:text-lg font-bold text-white">{manifests.length} files</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Main Search Area */}
        <div className="grid md:grid-cols-2 gap-3 sm:gap-6 mb-4 sm:mb-6">
          {/* Tracking Search */}
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-5">
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
              <Search className="w-4 h-4 sm:w-5 sm:h-5" /> Search Tracking # or PO #
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="1Z90A10R0306936706 or PO#"
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-indigo-500 transition-colors text-gray-900 text-sm sm:text-base"
              />
              <button
                onClick={() => handleSearch()}
                disabled={loading || !query.trim()}
                className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 active:from-blue-800 active:to-purple-800 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold rounded-lg sm:rounded-xl transition-all flex items-center gap-2"
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
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-5">
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-2 text-sm sm:text-base">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5" /> Search by Origin ZIP
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={originZip}
                onChange={(e) => setOriginZip(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && searchInboundByOrigin()}
                placeholder="e.g. 92801 (Image Tech)"
                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:border-amber-500 transition-colors text-gray-900 text-sm sm:text-base"
              />
              <button
                onClick={searchInboundByOrigin}
                disabled={inboundLoading || !originZip.trim()}
                className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 active:from-amber-700 active:to-orange-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold rounded-lg sm:rounded-xl transition-all flex items-center gap-2"
              >
                {inboundLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Filter className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-[11px] sm:text-xs text-gray-500 mt-2">Find shipments from supplier locations</p>
          </div>
        </div>

        {/* Search Result */}
        {result && activeTab === 'search' && (
          <div className={`rounded-2xl shadow-xl p-6 mb-6 border-2 ${getResultColor()}`}>
            {/* Result Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                {result.type === 'inbound' && <ArrowDownToLine className="w-12 h-12 text-blue-600" />}
                {result.type === 'outbound' && <ArrowUpFromLine className="w-12 h-12 text-green-600" />}
                {result.type === 'both' && <Package className="w-12 h-12 text-purple-600" />}
                {result.type === 'none' && <XCircle className="w-12 h-12 text-red-600" />}
                <div>
                  <p className="text-2xl font-bold text-gray-800">{result.message}</p>
                  <p className="font-mono text-gray-600">{result.tracking}</p>
                </div>
              </div>
              {result.carrier && (
                <button
                  onClick={() => openTrackingModal(result.tracking, result.carrier!)}
                  className={`px-4 py-2 rounded-lg font-semibold flex items-center gap-2 transition-colors ${
                    result.carrier === 'UPS' 
                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' 
                      : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  Full Details
                </button>
              )}
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
                  
                  {/* Reference Numbers */}
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
                    {result.upsLive.deliveredAt && (
                      <div>
                        <p className="text-green-600 text-xs">Delivered</p>
                        <p className="font-bold text-green-700">{result.upsLive.deliveredAt}</p>
                      </div>
                    )}
                  </div>
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

                  {/* Reference Numbers */}
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
                        {result.fedexLive.customerReference && (
                          <div className="col-span-2">
                            <span className="text-purple-700 text-xs">Customer Ref:</span>
                            <span className="font-bold text-gray-900 ml-1">{result.fedexLive.customerReference}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-purple-600 text-xs">Status</p>
                      <p className="font-bold text-gray-800">{result.fedexLive.status}</p>
                    </div>
                    {result.fedexLive.service && (
                      <div>
                        <p className="text-purple-600 text-xs">Service</p>
                        <p className="font-bold text-gray-800">{result.fedexLive.service}</p>
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
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl sm:rounded-2xl border border-white/10 overflow-hidden">
          <div className="flex border-b border-white/10 overflow-x-auto tab-scroll">
            <button
              onClick={() => setActiveTab('inbound')}
              className={`flex-1 min-w-[70px] px-2 sm:px-3 py-2.5 sm:py-3 font-semibold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ${
                activeTab === 'inbound' 
                  ? 'bg-blue-500/20 text-blue-300 border-b-2 border-blue-400' 
                  : 'text-white/60 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <ArrowDownToLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Inbound</span>
              <span className="sm:hidden">In</span>
            </button>
            <button
              onClick={() => setActiveTab('outbound')}
              className={`flex-1 min-w-[70px] px-2 sm:px-3 py-2.5 sm:py-3 font-semibold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ${
                activeTab === 'outbound' 
                  ? 'bg-green-500/20 text-green-300 border-b-2 border-green-400' 
                  : 'text-white/60 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <ArrowUpFromLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Outbound</span>
              <span className="sm:hidden">Out</span>
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`flex-1 min-w-[70px] px-2 sm:px-3 py-2.5 sm:py-3 font-semibold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ${
                activeTab === 'suppliers' 
                  ? 'bg-purple-500/20 text-purple-300 border-b-2 border-purple-400' 
                  : 'text-white/60 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Suppliers</span>
              <span className="sm:hidden">Sup</span>
            </button>
            <button
              onClick={() => setActiveTab('batch')}
              className={`flex-1 min-w-[60px] px-2 sm:px-3 py-2.5 sm:py-3 font-semibold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ${
                activeTab === 'batch' 
                  ? 'bg-cyan-500/20 text-cyan-300 border-b-2 border-cyan-400' 
                  : 'text-white/60 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Batch
            </button>
            <button
              onClick={() => { setActiveTab('reports'); fetchReports(); }}
              className={`flex-1 min-w-[60px] px-2 sm:px-3 py-2.5 sm:py-3 font-semibold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ${
                activeTab === 'reports' 
                  ? 'bg-teal-500/20 text-teal-300 border-b-2 border-teal-400' 
                  : 'text-white/60 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Reports</span>
              <span className="md:hidden">📊</span>
            </button>
            <button
              onClick={() => setActiveTab('quantum')}
              className={`flex-1 min-w-[50px] px-2 sm:px-3 py-2.5 sm:py-3 font-semibold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ${
                activeTab === 'quantum' 
                  ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400' 
                  : 'text-white/60 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              QV
            </button>
            <button
              onClick={() => { setActiveTab('manifests'); fetchManifests(); }}
              className={`flex-1 min-w-[50px] px-2 sm:px-3 py-2.5 sm:py-3 font-semibold flex items-center justify-center gap-1 sm:gap-2 transition-colors text-xs sm:text-sm whitespace-nowrap ${
                activeTab === 'manifests' 
                  ? 'bg-rose-500/20 text-rose-300 border-b-2 border-rose-400' 
                  : 'text-white/60 hover:bg-white/5 active:bg-white/10'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden md:inline">Manifests</span>
              <span className="md:hidden">📁</span>
            </button>
          </div>

          <div className="p-3 sm:p-4 max-h-[400px] sm:max-h-[500px] overflow-y-auto">
            {/* Inbound Tab */}
            {activeTab === 'inbound' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-white/60 text-sm">Recent inbound scans</p>
                  <button
                    onClick={() => exportToCSV(recentScans, 'inbound-scans')}
                    disabled={recentScans.length === 0}
                    className="text-xs px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                </div>
                {recentScans.length === 0 ? (
                  <p className="text-white/40 text-center py-8">No recent inbound scans</p>
                ) : (
                  recentScans.map((scan, i) => (
                    <div
                      key={`${scan.tracking}-${i}`}
                      className="w-full text-left p-3 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors flex justify-between items-start"
                    >
                      <button onClick={() => handleSearch(scan.tracking)} className="text-left flex-1">
                        <p className="font-mono text-white text-sm">{scan.tracking}</p>
                        {scan.po && <p className="text-blue-300 text-xs">PO: {scan.po}</p>}
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <p className="text-white/60 text-xs">{scan.timestamp}</p>
                          <span className="inline-block px-2 py-0.5 bg-blue-500/30 text-blue-300 text-xs rounded-full">
                            {scan.status}
                          </span>
                        </div>
                        <button 
                          onClick={() => openTrackingModal(scan.tracking, detectCarrier(scan.tracking))}
                          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg"
                          title="View full details"
                        >
                          <Eye className="w-4 h-4 text-white/60" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Outbound Tab */}
            {activeTab === 'outbound' && (
              <div className="space-y-2">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-white/60 text-sm">Recent outbound shipments</p>
                  <button
                    onClick={() => exportToCSV(recentOutbound, 'outbound-shipments')}
                    disabled={recentOutbound.length === 0}
                    className="text-xs px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-300 rounded-lg flex items-center gap-1"
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                </div>
                {recentOutbound.length === 0 ? (
                  <p className="text-white/40 text-center py-8">No recent outbound shipments</p>
                ) : (
                  recentOutbound.map((ship, i) => (
                    <div
                      key={`${ship.tracking}-${i}`}
                      className="w-full text-left p-3 bg-green-500/10 hover:bg-green-500/20 rounded-xl transition-colors flex justify-between items-start"
                    >
                      <button onClick={() => handleSearch(ship.tracking)} className="text-left flex-1">
                        <p className="font-mono text-white text-sm">{ship.tracking}</p>
                        <p className="text-green-300 text-xs">To: {ship.recipient}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="inline-block px-2 py-0.5 bg-green-500/30 text-green-300 text-xs rounded-full">
                            {ship.location}
                          </span>
                          <p className="text-white/60 text-xs mt-1">{ship.service}</p>
                        </div>
                        <button 
                          onClick={() => openTrackingModal(ship.tracking, detectCarrier(ship.tracking))}
                          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg"
                          title="View full details"
                        >
                          <Eye className="w-4 h-4 text-white/60" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Suppliers Tab */}
            {activeTab === 'suppliers' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    Supplier Directory
                  </h3>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {suppliers.map(supplier => (
                    <div
                      key={supplier.id}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                        selectedSupplier === supplier.id
                          ? 'bg-purple-500/20 border-purple-400'
                          : 'bg-white/5 border-white/10 hover:bg-white/10'
                      }`}
                      onClick={() => fetchSupplierShipments(supplier.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-bold text-white">{supplier.name}</h4>
                          <p className="text-white/60 text-sm">{supplier.city}, {supplier.state}</p>
                        </div>
                        <a
                          href={supplier.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg"
                        >
                          <ExternalLink className="w-4 h-4 text-white/60" />
                        </a>
                      </div>
                      <p className="text-xs text-purple-300 mb-2">{supplier.category}</p>
                      <div className="flex flex-wrap gap-1">
                        {supplier.zipCodes.slice(0, 3).map(zip => (
                          <span key={zip} className="px-2 py-0.5 bg-white/10 text-white/70 text-xs rounded-full font-mono">
                            {zip}
                          </span>
                        ))}
                        {supplier.zipCodes.length > 3 && (
                          <span className="px-2 py-0.5 bg-white/10 text-white/50 text-xs rounded-full">
                            +{supplier.zipCodes.length - 3} more
                          </span>
                        )}
                      </div>
                      {supplier.contact?.phone && (
                        <p className="text-white/50 text-xs mt-2">📞 {supplier.contact.phone}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Supplier Shipments */}
                {selectedSupplier && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-white font-semibold">
                        Shipments from {suppliers.find(s => s.id === selectedSupplier)?.name}
                      </h4>
                      {supplierLoading && <Loader2 className="w-4 h-4 text-white animate-spin" />}
                    </div>
                    
                    {supplierShipments.length === 0 ? (
                      <p className="text-white/40 text-center py-4">
                        {supplierLoading ? 'Loading shipments...' : 'No recent shipments found from this supplier'}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {supplierShipments.map((ship, i) => (
                          <button
                            key={i}
                            onClick={() => handleSearch(ship.tracking)}
                            className="w-full text-left p-3 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl transition-colors"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    ship.carrier === 'UPS' ? 'bg-amber-600 text-white' : 'bg-purple-600 text-white'
                                  }`}>
                                    {ship.carrier}
                                  </span>
                                  <p className="font-mono text-white text-sm">{ship.tracking}</p>
                                </div>
                                {ship.poNumber && <p className="text-purple-300 text-xs mt-1">PO: {ship.poNumber}</p>}
                              </div>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                ship.statusDescription?.toLowerCase().includes('delivered')
                                  ? 'bg-green-500/30 text-green-300'
                                  : ship.isException
                                  ? 'bg-red-500/30 text-red-300'
                                  : 'bg-blue-500/30 text-blue-300'
                              }`}>
                                {ship.statusDescription || ship.status}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Batch Tracking Tab */}
            {activeTab === 'batch' && (
              <div className="space-y-4">
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
                      <div
                        key={i}
                        className={`w-full text-left p-3 rounded-xl transition-colors flex justify-between items-start ${
                          result.statusDescription?.toLowerCase().includes('delivered')
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20'
                            : result.isException
                            ? 'bg-red-500/10 hover:bg-red-500/20'
                            : 'bg-cyan-500/10 hover:bg-cyan-500/20'
                        }`}
                      >
                        <button onClick={() => handleSearch(result.tracking)} className="text-left flex-1">
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
                        </button>
                        <div className="flex items-center gap-2">
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
                          </div>
                          <button 
                            onClick={() => openTrackingModal(result.tracking, result.carrier as 'UPS' | 'FedEx')}
                            className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg"
                            title="View full details"
                          >
                            <Eye className="w-4 h-4 text-white/60" />
                          </button>
                        </div>
                      </div>
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

            {/* Reports Tab */}
            {activeTab === 'reports' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-teal-400" />
                    Shipment Reports
                  </h3>
                  <button
                    onClick={fetchReports}
                    disabled={reportLoading}
                    className="px-3 py-1.5 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    {reportLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Refresh
                  </button>
                </div>

                {reportLoading && !reportData ? (
                  <div className="text-center py-12">
                    <Loader2 className="w-8 h-8 text-white/40 animate-spin mx-auto" />
                    <p className="text-white/40 mt-3">Loading reports...</p>
                  </div>
                ) : reportData ? (
                  <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-blue-500/20 rounded-xl p-4 text-center">
                        <p className="text-blue-300 text-xs">Total Inbound</p>
                        <p className="text-2xl font-bold text-white">{reportData.summary.totalInbound.toLocaleString()}</p>
                      </div>
                      <div className="bg-green-500/20 rounded-xl p-4 text-center">
                        <p className="text-green-300 text-xs">Total Outbound</p>
                        <p className="text-2xl font-bold text-white">{reportData.summary.totalOutbound.toLocaleString()}</p>
                      </div>
                      <div className="bg-amber-500/20 rounded-xl p-4 text-center">
                        <p className="text-amber-300 text-xs">Today Inbound</p>
                        <p className="text-2xl font-bold text-white">{reportData.summary.todayInbound}</p>
                      </div>
                      <div className="bg-purple-500/20 rounded-xl p-4 text-center">
                        <p className="text-purple-300 text-xs">Today Outbound</p>
                        <p className="text-2xl font-bold text-white">{reportData.summary.todayOutbound}</p>
                      </div>
                    </div>

                    {/* Daily Trend Chart */}
                    <div className="bg-white/5 rounded-xl p-4">
                      <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-teal-400" />
                        7-Day Trend
                      </h4>
                      <div className="flex items-end gap-2 h-40">
                        {reportData.dailyStats.map((day, i) => {
                          const maxVal = Math.max(
                            ...reportData.dailyStats.map(d => Math.max(d.inboundCount, d.outboundCount))
                          ) || 1;
                          const inboundHeight = (day.inboundCount / maxVal) * 100;
                          const outboundHeight = (day.outboundCount / maxVal) * 100;
                          
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                              <div className="flex gap-1 items-end h-28 w-full">
                                <div 
                                  className="flex-1 bg-blue-500/60 rounded-t transition-all"
                                  style={{ height: `${inboundHeight}%` }}
                                  title={`Inbound: ${day.inboundCount}`}
                                />
                                <div 
                                  className="flex-1 bg-green-500/60 rounded-t transition-all"
                                  style={{ height: `${outboundHeight}%` }}
                                  title={`Outbound: ${day.outboundCount}`}
                                />
                              </div>
                              <p className="text-white/40 text-xs">
                                {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex justify-center gap-6 mt-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-blue-500/60 rounded" />
                          <span className="text-white/60 text-xs">Inbound</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500/60 rounded" />
                          <span className="text-white/60 text-xs">Outbound</span>
                        </div>
                      </div>
                    </div>

                    {/* Performance Metrics */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-white/5 rounded-xl p-4 text-center">
                        <p className="text-white/60 text-xs">Avg Daily Inbound</p>
                        <p className="text-xl font-bold text-white">{reportData.performance.avgDailyInbound}</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 text-center">
                        <p className="text-white/60 text-xs">Avg Daily Outbound</p>
                        <p className="text-xl font-bold text-white">{reportData.performance.avgDailyOutbound}</p>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 text-center">
                        <p className="text-white/60 text-xs">Exceptions Today</p>
                        <p className={`text-xl font-bold ${reportData.performance.exceptionsToday > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {reportData.performance.exceptionsToday}
                        </p>
                      </div>
                    </div>

                    {/* Export Button */}
                    <div className="flex justify-center">
                      <button
                        onClick={async () => {
                          const res = await fetch('/api/reports?action=export&format=csv');
                          const blob = await res.blob();
                          const link = document.createElement('a');
                          link.href = URL.createObjectURL(blob);
                          link.download = `shipment-report-${new Date().toISOString().split('T')[0]}.csv`;
                          link.click();
                        }}
                        className="px-4 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded-xl flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Export Full Report (CSV)
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <BarChart3 className="w-12 h-12 text-white/20 mx-auto mb-3" />
                    <p className="text-white/40">Click refresh to load reports</p>
                  </div>
                )}
              </div>
            )}

            {/* Quantum View Tab - Combined UPS & FedEx Visibility */}
            {activeTab === 'quantum' && (
              <div className="space-y-4">
                {/* Carrier Selection */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex gap-1 bg-white/5 rounded-lg p-1">
                    <button
                      onClick={() => setQvCarrier('all')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        qvCarrier === 'all' ? 'bg-gradient-to-r from-amber-500 to-purple-500 text-white' : 'text-white/60 hover:bg-white/10'
                      }`}
                    >
                      All Carriers
                    </button>
                    <button
                      onClick={() => setQvCarrier('ups')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        qvCarrier === 'ups' ? 'bg-amber-500 text-white' : 'text-white/60 hover:bg-white/10'
                      }`}
                    >
                      🟤 UPS
                    </button>
                    <button
                      onClick={() => setQvCarrier('fedex')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        qvCarrier === 'fedex' ? 'bg-purple-500 text-white' : 'text-white/60 hover:bg-white/10'
                      }`}
                    >
                      🟣 FedEx
                    </button>
                  </div>
                  <button
                    onClick={refreshAllVisibility}
                    disabled={qvLoading || fedexLoading}
                    className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-purple-500 hover:from-amber-600 hover:to-purple-600 disabled:from-gray-500 disabled:to-gray-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    {(qvLoading || fedexLoading) ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    Refresh All
                  </button>
                </div>

                {/* View Tabs */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setQvSubTab('inbound')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      qvSubTab === 'inbound' ? 'bg-blue-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    📥 Inbound ({
                      qvCarrier === 'ups' ? qvData.inbound.length :
                      qvCarrier === 'fedex' ? fedexData.inbound.length :
                      qvData.inbound.length + fedexData.inbound.length
                    })
                  </button>
                  <button
                    onClick={() => setQvSubTab('outbound')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      qvSubTab === 'outbound' ? 'bg-green-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    📤 Outbound ({
                      qvCarrier === 'ups' ? qvData.outbound.length :
                      qvCarrier === 'fedex' ? fedexData.outbound.length :
                      qvData.outbound.length + fedexData.outbound.length
                    })
                  </button>
                  <button
                    onClick={() => setQvSubTab('arriving')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      qvSubTab === 'arriving' ? 'bg-amber-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    🚚 Today ({
                      qvCarrier === 'ups' ? qvData.arrivingToday.length :
                      qvCarrier === 'fedex' ? fedexData.arrivingToday.length :
                      qvData.arrivingToday.length + fedexData.arrivingToday.length
                    })
                  </button>
                  <button
                    onClick={() => setQvSubTab('exceptions')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      qvSubTab === 'exceptions' ? 'bg-red-500 text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    ⚠️ Exceptions ({
                      qvCarrier === 'ups' ? qvData.exceptions.length :
                      qvCarrier === 'fedex' ? fedexData.exceptions.length :
                      qvData.exceptions.length + fedexData.exceptions.length
                    })
                  </button>
                </div>

                {/* Status Info */}
                <div className="grid sm:grid-cols-2 gap-2">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                    <p className="text-amber-300 text-xs font-medium flex items-center gap-2">
                      🟤 UPS Quantum View
                      {qvLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </p>
                    <p className="text-amber-200/60 text-xs mt-1">
                      {qvStats.totalShipments > 0 ? `${qvStats.totalShipments} shipments` : 'Awaiting QVD activation'}
                    </p>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
                    <p className="text-purple-300 text-xs font-medium flex items-center gap-2">
                      🟣 FedEx Visibility
                      {fedexLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </p>
                    <p className="text-purple-200/60 text-xs mt-1">
                      {fedexData.inbound.length + fedexData.outbound.length > 0 
                        ? `${fedexData.inbound.length + fedexData.outbound.length} shipments (polling)` 
                        : 'Click Refresh to load'}
                    </p>
                  </div>
                </div>

                {/* Shipment List */}
                {qvSubTab === 'inbound' && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {/* UPS Inbound */}
                    {(qvCarrier === 'ups' || qvCarrier === 'all') && qvData.inbound.map((ship, i) => (
                      <button
                        key={`ups-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded">UPS</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                        </div>
                        <p className="text-amber-300 text-xs mt-1">From: {ship.shipperName || ship.shipperAddress}</p>
                      </button>
                    ))}
                    {/* FedEx Inbound */}
                    {(qvCarrier === 'fedex' || qvCarrier === 'all') && fedexData.inbound.map((ship, i) => (
                      <button
                        key={`fedex-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded">FedEx</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                        </div>
                        <p className="text-purple-300 text-xs mt-1">From: {ship.shipperName || ship.shipperAddress}</p>
                      </button>
                    ))}
                    {/* Empty State */}
                    {((qvCarrier === 'ups' && qvData.inbound.length === 0) ||
                      (qvCarrier === 'fedex' && fedexData.inbound.length === 0) ||
                      (qvCarrier === 'all' && qvData.inbound.length === 0 && fedexData.inbound.length === 0)) && (
                      <div className="text-center py-6">
                        <p className="text-white/40">No inbound shipments</p>
                        <p className="text-white/30 text-xs mt-1">Click Refresh to load carrier data</p>
                      </div>
                    )}
                  </div>
                )}

                {qvSubTab === 'outbound' && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {/* UPS Outbound */}
                    {(qvCarrier === 'ups' || qvCarrier === 'all') && qvData.outbound.map((ship, i) => (
                      <button
                        key={`ups-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded">UPS</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                        </div>
                        <p className="text-green-300 text-xs mt-1">To: {ship.recipientName || ship.recipientAddress}</p>
                      </button>
                    ))}
                    {/* FedEx Outbound */}
                    {(qvCarrier === 'fedex' || qvCarrier === 'all') && fedexData.outbound.map((ship, i) => (
                      <button
                        key={`fedex-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded">FedEx</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                        </div>
                        <p className="text-green-300 text-xs mt-1">To: {ship.recipientName || ship.recipientAddress}</p>
                      </button>
                    ))}
                    {/* Empty State */}
                    {((qvCarrier === 'ups' && qvData.outbound.length === 0) ||
                      (qvCarrier === 'fedex' && fedexData.outbound.length === 0) ||
                      (qvCarrier === 'all' && qvData.outbound.length === 0 && fedexData.outbound.length === 0)) && (
                      <div className="text-center py-6">
                        <p className="text-white/40">No outbound shipments</p>
                      </div>
                    )}
                  </div>
                )}

                {qvSubTab === 'arriving' && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {/* UPS Arriving Today */}
                    {(qvCarrier === 'ups' || qvCarrier === 'all') && qvData.arrivingToday.map((ship, i) => (
                      <button
                        key={`ups-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded">UPS</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                          <span className="bg-amber-500/30 text-amber-300 text-[10px] px-1.5 py-0.5 rounded ml-auto">TODAY</span>
                        </div>
                        <p className="text-amber-300 text-xs mt-1">From: {ship.shipperName || ship.shipperAddress}</p>
                      </button>
                    ))}
                    {/* FedEx Arriving Today */}
                    {(qvCarrier === 'fedex' || qvCarrier === 'all') && fedexData.arrivingToday.map((ship, i) => (
                      <button
                        key={`fedex-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded">FedEx</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                          <span className="bg-purple-500/30 text-purple-300 text-[10px] px-1.5 py-0.5 rounded ml-auto">TODAY</span>
                        </div>
                        <p className="text-purple-300 text-xs mt-1">From: {ship.shipperName || ship.shipperAddress}</p>
                      </button>
                    ))}
                    {/* Empty State */}
                    {((qvCarrier === 'ups' && qvData.arrivingToday.length === 0) ||
                      (qvCarrier === 'fedex' && fedexData.arrivingToday.length === 0) ||
                      (qvCarrier === 'all' && qvData.arrivingToday.length === 0 && fedexData.arrivingToday.length === 0)) && (
                      <div className="text-center py-6">
                        <p className="text-white/40">No packages arriving today</p>
                      </div>
                    )}
                  </div>
                )}

                {qvSubTab === 'exceptions' && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {/* UPS Exceptions */}
                    {(qvCarrier === 'ups' || qvCarrier === 'all') && qvData.exceptions.map((ship, i) => (
                      <button
                        key={`ups-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors border border-red-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded">UPS</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                          <span className="bg-red-500/30 text-red-300 text-[10px] px-1.5 py-0.5 rounded ml-auto">⚠️ EXCEPTION</span>
                        </div>
                        <p className="text-red-300 text-xs mt-1">{ship.status}</p>
                      </button>
                    ))}
                    {/* FedEx Exceptions */}
                    {(qvCarrier === 'fedex' || qvCarrier === 'all') && fedexData.exceptions.map((ship, i) => (
                      <button
                        key={`fedex-${i}`}
                        onClick={() => handleSearch(ship.trackingNumber)}
                        className="w-full text-left p-3 bg-red-500/10 hover:bg-red-500/20 rounded-xl transition-colors border border-red-500/30"
                      >
                        <div className="flex items-center gap-2">
                          <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded">FedEx</span>
                          <p className="font-mono text-white text-sm">{ship.trackingNumber}</p>
                          <span className="bg-red-500/30 text-red-300 text-[10px] px-1.5 py-0.5 rounded ml-auto">⚠️ EXCEPTION</span>
                        </div>
                        <p className="text-red-300 text-xs mt-1">{ship.status}</p>
                      </button>
                    ))}
                    {/* Empty State */}
                    {((qvCarrier === 'ups' && qvData.exceptions.length === 0) ||
                      (qvCarrier === 'fedex' && fedexData.exceptions.length === 0) ||
                      (qvCarrier === 'all' && qvData.exceptions.length === 0 && fedexData.exceptions.length === 0)) && (
                      <div className="text-center py-6">
                        <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                        <p className="text-green-400">No exceptions! 🎉</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manifests Tab */}
            {activeTab === 'manifests' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-rose-400" />
                    Manifest Files
                  </h3>
                  <button
                    onClick={fetchManifests}
                    disabled={manifestsLoading}
                    className="px-3 py-1.5 bg-rose-500/20 text-rose-300 rounded-lg hover:bg-rose-500/30 transition-colors text-sm flex items-center gap-2"
                  >
                    {manifestsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Refresh
                  </button>
                </div>

                {/* Tracking Index Stats */}
                {indexStats && (
                  <div className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl p-4 border border-indigo-400/30">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-indigo-300 text-sm font-medium flex items-center gap-2">
                        <Search className="w-4 h-4" /> Tracking Index
                      </h4>
                      {indexStats.lastUpdated && (
                        <span className="text-white/40 text-xs">
                          Updated: {new Date(indexStats.lastUpdated).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      <div className="bg-white/10 rounded-lg p-2 text-center">
                        <p className="text-2xl font-bold text-white">{indexStats.trackingCount.toLocaleString()}</p>
                        <p className="text-white/50 text-xs">Total Indexed</p>
                      </div>
                      <div className="bg-blue-500/20 rounded-lg p-2 text-center">
                        <p className="text-xl font-bold text-blue-300">{(indexStats.bySource?.sanmar || 0).toLocaleString()}</p>
                        <p className="text-blue-400/60 text-xs">Sanmar</p>
                      </div>
                      <div className="bg-green-500/20 rounded-lg p-2 text-center">
                        <p className="text-xl font-bold text-green-300">{(indexStats.bySource?.ss || 0).toLocaleString()}</p>
                        <p className="text-green-400/60 text-xs">S&S</p>
                      </div>
                      <div className="bg-pink-500/20 rounded-lg p-2 text-center">
                        <p className="text-xl font-bold text-pink-300">{(indexStats.bySource?.customink || 0).toLocaleString()}</p>
                        <p className="text-pink-400/60 text-xs">CustomInk</p>
                      </div>
                    </div>
                    <p className="text-white/40 text-xs">🔄 Index auto-rebuilds every 15 minutes from scheduled task</p>
                  </div>
                )}

                {/* Combined Files - Quick Download */}
                {indexStats?.combinedFiles && indexStats.combinedFiles.length > 0 && (
                  <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-xl p-4 border border-amber-400/30">
                    <h4 className="text-amber-300 text-sm font-medium mb-3 flex items-center gap-2">
                      <Download className="w-4 h-4" /> Combined Manifests (For Offline Label Print GUI)
                    </h4>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {indexStats.combinedFiles.map((file, i) => (
                        <a
                          key={i}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-colors group"
                        >
                          <FileSpreadsheet className="w-8 h-8 text-amber-400 group-hover:scale-110 transition-transform" />
                          <div className="flex-1 min-w-0">
                            <p className="text-white font-medium text-sm truncate">{file.name}</p>
                            <p className="text-white/50 text-xs">
                              {(file.size / 1024).toFixed(0)} KB • {new Date(file.uploadedAt).toLocaleDateString()}
                            </p>
                          </div>
                          <Download className="w-5 h-5 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ))}
                    </div>
                    <p className="text-white/40 text-xs mt-2">📥 Download these files for use with the offline label print GUI</p>
                  </div>
                )}

                {/* Auto-Capture Status */}
                <div className="bg-gradient-to-r from-emerald-500/10 to-green-500/10 rounded-xl p-4 border border-emerald-400/20">
                  <h4 className="text-emerald-300 text-sm font-medium mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Auto-Captured via Email
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                      <span className="text-white/80 text-sm">Sanmar</span>
                      <span className="text-emerald-400 text-xs ml-auto">CSV via Make.com</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                      <span className="text-white/80 text-sm">S&S Activewear</span>
                      <span className="text-emerald-400 text-xs ml-auto">XLSX via Make.com</span>
                    </div>
                    <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg">
                      <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                      <span className="text-white/80 text-sm">CustomInk</span>
                      <span className="text-blue-400 text-xs ml-auto">via API Script</span>
                    </div>
                  </div>
                  <p className="text-white/40 text-xs mt-2">📧 Manifests auto-captured when forwarded to Make.com webhook</p>
                </div>

                {/* Manual Upload - Only QV Inbound */}
                <div className="bg-white/5 rounded-xl p-4">
                  <h4 className="text-white/80 text-sm font-medium mb-3 flex items-center gap-2">
                    <FileUp className="w-4 h-4" /> Manual Upload
                  </h4>
                  <label className="flex items-center gap-3 p-3 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl cursor-pointer transition-colors border border-amber-400/30">
                    <Upload className="w-5 h-5 text-amber-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">UPS Quantum View Inbound</p>
                      <p className="text-white/50 text-xs">Download from UPS → Upload CSV here</p>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      disabled={uploadingManifest}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleManifestUpload('inbound', file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {uploadingManifest && (
                    <div className="mt-3 flex items-center gap-2 text-white/60 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                    </div>
                  )}
                </div>

                {/* Manifest List - Grouped by Supplier */}
                <div className="space-y-3">
                  <h4 className="text-white/60 text-sm flex items-center justify-between">
                    <span>📁 Stored Manifests</span>
                    <span className="text-white/40 text-xs">{manifests.length} files • Keeps 10 per supplier</span>
                  </h4>
                  {manifestsLoading ? (
                    <div className="text-center py-6">
                      <Loader2 className="w-6 h-6 text-white/40 animate-spin mx-auto" />
                    </div>
                  ) : manifests.length === 0 ? (
                    <div className="text-center py-6">
                      <File className="w-10 h-10 text-white/20 mx-auto mb-2" />
                      <p className="text-white/40">No manifests yet</p>
                      <p className="text-white/30 text-sm mt-1">Forward supplier emails to Make.com to auto-capture</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Group by supplier type */}
                      {['sanmar', 'ss', 'customink', 'inbound'].map(type => {
                        const typeManifests = manifests.filter(m => 
                          m.filename.toLowerCase().startsWith(type) || m.type === type
                        );
                        if (typeManifests.length === 0) return null;
                        const colors: Record<string, string> = {
                          sanmar: 'blue',
                          ss: 'green', 
                          customink: 'pink',
                          inbound: 'amber'
                        };
                        const labels: Record<string, string> = {
                          sanmar: 'Sanmar',
                          ss: 'S&S Activewear',
                          customink: 'CustomInk',
                          inbound: 'UPS QV Inbound'
                        };
                        const color = colors[type] || 'gray';
                        return (
                          <div key={type} className={`bg-${color}-500/5 rounded-xl p-3 border border-${color}-400/20`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-2 h-2 bg-${color}-400 rounded-full`}></div>
                              <span className={`text-${color}-300 text-sm font-medium`}>{labels[type]}</span>
                              <span className="text-white/40 text-xs ml-auto">{typeManifests.length} file{typeManifests.length > 1 ? 's' : ''}</span>
                            </div>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {typeManifests.slice(0, 5).map((m, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 p-2 bg-black/20 hover:bg-black/30 rounded-lg transition-colors text-xs"
                                >
                                  <File className={`w-3 h-3 text-${color}-400 flex-shrink-0`} />
                                  <span className="text-white/80 truncate flex-1">{m.filename}</span>
                                  <span className="text-white/40 text-[10px]">{(m.size / 1024).toFixed(0)}KB</span>
                                  <a
                                    href={m.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white/50 hover:text-white transition-colors"
                                    title={`Download ${m.filename}`}
                                  >
                                    <Download className="w-3 h-3" />
                                  </a>
                                </div>
                              ))}
                              {typeManifests.length > 5 && (
                                <p className="text-white/30 text-[10px] text-center py-1">+{typeManifests.length - 5} more</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Integration Info */}
                <div className="bg-gradient-to-r from-violet-500/10 to-purple-500/10 rounded-xl p-4 border border-violet-400/20">
                  <h4 className="text-violet-300 text-sm font-medium mb-2">📧 Email Auto-Capture</h4>
                  <p className="text-white/60 text-xs mb-2">
                    Forward supplier manifests to your Make.com webhook:
                  </p>
                  <code className="block bg-black/30 text-violet-400 text-[10px] p-2 rounded font-mono break-all">
                    b15cp08jrvj2nnmnhxxjn56xl9b7clm6@hook.us2.make.com
                  </code>
                  <p className="text-white/40 text-[10px] mt-2">
                    Sanmar & S&S emails → auto-detected → stored with timestamps
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="text-center py-4 px-3 text-white/40 text-xs sm:text-sm border-t border-white/10 mt-6 sm:mt-8 safe-area-bottom">
        <p className="leading-relaxed">Promos Ink Supply Chain Platform<span className="hidden sm:inline"> •</span><br className="sm:hidden" /> FB1 & FB2 Warehouses • Dallas, TX</p>
        <p className="text-[10px] sm:text-xs mt-1 opacity-70">
          Suppliers: Image Technology • Grimco • Nazdar • Kornit
        </p>
      </footer>
    </div>
  );
}
