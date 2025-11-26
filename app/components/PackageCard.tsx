'use client';

import { Package, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import type { ScanRecord } from '../types';

interface PackageCardProps {
  record: ScanRecord;
  onConfirm: (record: ScanRecord) => void;
}

export default function PackageCard({ record, onConfirm }: PackageCardProps) {
  const isOverdue = record.dueDate?.toLowerCase().includes('overdue');
  
  const getStatusColor = () => {
    if (record.confirmed) return 'bg-green-50 border-green-300 text-green-800';
    if (isOverdue) return 'bg-red-50 border-red-300 text-red-800';
    return 'bg-amber-50 border-amber-300 text-amber-800';
  };

  const getStatusIcon = () => {
    if (record.confirmed) return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (isOverdue) return <AlertTriangle className="w-5 h-5 text-red-600" />;
    return <Clock className="w-5 h-5 text-amber-600" />;
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className={`border-2 rounded-xl p-5 shadow-sm hover:shadow-md transition-all ${getStatusColor()}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-bold text-sm">
            {record.confirmed ? 'CONFIRMED' : isOverdue ? 'OVERDUE' : 'PENDING'}
          </span>
        </div>
        <Package className="w-5 h-5 opacity-50" />
      </div>

      {/* Tracking Number */}
      <div className="mb-3">
        <p className="text-xs opacity-70 uppercase tracking-wide">Tracking #</p>
        <p className="font-mono font-bold text-sm break-all">{record.tracking}</p>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
        {record.poNumber && (
          <div>
            <p className="text-xs opacity-70">PO #</p>
            <p className="font-semibold">{record.poNumber}</p>
          </div>
        )}
        {record.customer && (
          <div>
            <p className="text-xs opacity-70">Customer</p>
            <p className="font-semibold truncate" title={record.customer}>{record.customer}</p>
          </div>
        )}
        {record.dueDate && (
          <div>
            <p className="text-xs opacity-70">Due Date</p>
            <p className="font-semibold">{record.dueDate}</p>
          </div>
        )}
        <div>
          <p className="text-xs opacity-70">Scanned</p>
          <p className="font-semibold text-xs">{formatDate(record.timestamp)}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="mb-3">
        <span className="inline-block px-2 py-1 text-xs font-medium rounded-full bg-white bg-opacity-50">
          {record.status}
        </span>
      </div>

      {/* Confirmation Details */}
      {record.confirmed && (
        <div className="mb-3 p-2 bg-white bg-opacity-50 rounded-lg text-sm">
          <p><span className="opacity-70">Confirmed by:</span> <strong>{record.confirmedBy}</strong></p>
          {record.confirmedAt && (
            <p className="text-xs opacity-70">{formatDate(record.confirmedAt)}</p>
          )}
          {record.notes && (
            <p className="mt-1 text-xs"><span className="opacity-70">Notes:</span> {record.notes}</p>
          )}
        </div>
      )}

      {/* Confirm Button */}
      {!record.confirmed && (
        <button
          onClick={() => onConfirm(record)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-lg transition-colors text-sm"
        >
          ✓ Confirm Receipt
        </button>
      )}
    </div>
  );
}
