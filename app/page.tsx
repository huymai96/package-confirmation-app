'use client';

import { useState, useEffect } from 'react';
import { PackageOpen, RefreshCw } from 'lucide-react';
import PackageCard from './components/PackageCard';
import ConfirmationModal from './components/ConfirmationModal';
import type { Package } from './types';

export default function Home() {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'received' | 'overdue'>('all');

  useEffect(() => {
    fetchPackages();
  }, []);

  const fetchPackages = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/packages');
      const data = await response.json();
      setPackages(data);
    } catch (error) {
      console.error('Error fetching packages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (receivedBy: string, notes: string) => {
    if (!selectedPackage) return;

    try {
      const response = await fetch(`/api/packages/${selectedPackage.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          receivedBy,
          receivedDate: new Date().toISOString(),
          notes,
        }),
      });

      if (response.ok) {
        const updatedPackage = await response.json();
        setPackages(packages.map(pkg => pkg.id === updatedPackage.id ? updatedPackage : pkg));
        setSelectedPackage(null);
      }
    } catch (error) {
      console.error('Error confirming package:', error);
    }
  };

  const filteredPackages = packages.filter(pkg => filter === 'all' || pkg.status === filter);

  const counts = {
    all: packages.length,
    pending: packages.filter(p => p.status === 'pending').length,
    received: packages.filter(p => p.status === 'received').length,
    overdue: packages.filter(p => p.status === 'overdue').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <PackageOpen className="w-10 h-10 text-primary-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Package Receipt System</h1>
                <p className="text-gray-600">Track and confirm incoming packages</p>
              </div>
            </div>
            <button
              onClick={fetchPackages}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              disabled={loading}
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            {(['all', 'pending', 'received', 'overdue'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === status
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)} ({counts[status]})
              </button>
            ))}
          </div>
        </div>

        {/* Package Grid */}
        {loading ? (
          <div className="text-center py-12">
            <RefreshCw className="w-12 h-12 text-primary-600 animate-spin mx-auto" />
            <p className="text-gray-600 mt-4">Loading packages...</p>
          </div>
        ) : filteredPackages.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <PackageOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No packages found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPackages.map((pkg) => (
              <PackageCard key={pkg.id} package={pkg} onConfirm={setSelectedPackage} />
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedPackage && (
        <ConfirmationModal
          package={selectedPackage}
          onConfirm={handleConfirm}
          onClose={() => setSelectedPackage(null)}
        />
      )}
    </div>
  );
}

