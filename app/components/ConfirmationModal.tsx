'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Package } from '../types';

interface ConfirmationModalProps {
  package: Package;
  onConfirm: (receivedBy: string, notes: string) => void;
  onClose: () => void;
}

export default function ConfirmationModal({ package: pkg, onConfirm, onClose }: ConfirmationModalProps) {
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (receivedBy.trim()) {
      onConfirm(receivedBy, notes);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">Confirm Package Receipt</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-4 p-4 bg-gray-50 rounded-lg">
          <p className="font-semibold text-gray-700">Order: {pkg.orderNumber}</p>
          <p className="text-gray-600">Supplier: {pkg.supplier}</p>
          <p className="text-gray-600">{pkg.description}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="receivedBy" className="block text-sm font-medium text-gray-700 mb-1">
              Received By <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="receivedBy"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
              placeholder="Enter your name"
              required
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-gray-900"
              placeholder="Add any notes about the package condition"
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors font-medium"
            >
              Confirm Receipt
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

