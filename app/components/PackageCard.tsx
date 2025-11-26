'use client';

import { Package as CheckIcon, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { Package } from '../types';

interface PackageCardProps {
  package: Package;
  onConfirm: (pkg: Package) => void;
}

export default function PackageCard({ package: pkg, onConfirm }: PackageCardProps) {
  const getStatusColor = () => {
    switch (pkg.status) {
      case 'received':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'overdue':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    }
  };

  const getStatusIcon = () => {
    switch (pkg.status) {
      case 'received':
        return <CheckIcon className="w-5 h-5" />;
      case 'overdue':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <Clock className="w-5 h-5" />;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch {
      return dateString;
    }
  };

  return (
    <div className={`border-2 rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow ${getStatusColor()}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <h3 className="font-bold text-lg">{pkg.orderNumber}</h3>
        </div>
        <span className="text-xs font-semibold uppercase px-2 py-1 rounded-full bg-white bg-opacity-50">
          {pkg.status}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div><span className="font-semibold">Supplier:</span> {pkg.supplier}</div>
        <div><span className="font-semibold">Description:</span> {pkg.description}</div>
        <div><span className="font-semibold">Expected:</span> {formatDate(pkg.expectedDate)}</div>
        {pkg.receivedDate && <div><span className="font-semibold">Received:</span> {formatDate(pkg.receivedDate)}</div>}
        {pkg.receivedBy && <div><span className="font-semibold">Received By:</span> {pkg.receivedBy}</div>}
        {pkg.notes && <div><span className="font-semibold">Notes:</span> {pkg.notes}</div>}
      </div>

      {pkg.status !== 'received' && (
        <button
          onClick={() => onConfirm(pkg)}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          Confirm Receipt
        </button>
      )}
    </div>
  );
}

