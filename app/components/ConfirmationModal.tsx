'use client';

import { useState } from 'react';
import { X, Package } from 'lucide-react';
import type { ScanRecord } from '../types';

interface ConfirmationModalProps {
  record: ScanRecord;
  onConfirm: (confirmedBy: string, notes: string) => void;
  onClose: () => void;
}

export default function ConfirmationModal({ record, onConfirm, onClose }: ConfirmationModalProps) {
  const [confirmedBy, setConfirmedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmedBy.trim()) {
      setIsSubmitting(true);
      await onConfirm(confirmedBy, notes);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Package className="w-6 h-6" />
            <h2 className="text-xl font-bold">Confirm Receipt</h2>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-white/20 rounded-full p-1 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Package Info */}
        <div className="p-4 bg-gray-50 border-b">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Tracking #</p>
              <p className="font-mono font-bold break-all">{record.tracking}</p>
            </div>
            {record.poNumber && (
              <div>
                <p className="text-gray-500 text-xs">PO #</p>
                <p className="font-bold">{record.poNumber}</p>
              </div>
            )}
            {record.customer && (
              <div className="col-span-2">
                <p className="text-gray-500 text-xs">Customer</p>
                <p className="font-bold">{record.customer}</p>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label htmlFor="confirmedBy" className="block text-sm font-semibold text-gray-700 mb-1">
              Your Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="confirmedBy"
              value={confirmedBy}
              onChange={(e) => setConfirmedBy(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 transition-colors"
              placeholder="Enter your name"
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-semibold text-gray-700 mb-1">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 text-gray-900 transition-colors resize-none"
              placeholder="Package condition, location, etc."
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !confirmedBy.trim()}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Confirming...' : 'Confirm ✓'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
