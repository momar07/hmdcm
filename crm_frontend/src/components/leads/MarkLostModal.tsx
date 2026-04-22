'use client';
import { useState } from 'react';

const LOST_REASONS = [
  'Price too high',
  'Chose competitor',
  'Not interested',
  'No budget',
  'No response',
  'Wrong contact',
  'Other',
];

interface Props {
  leadName: string;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

export default function MarkLostModal({ leadName, onConfirm, onClose }: Props) {
  const [reason,  setReason]  = useState('');
  const [custom,  setCustom]  = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const finalReason = reason === 'Other' ? custom : reason;

  const handleConfirm = async () => {
    if (!finalReason.trim()) {
      setError('Please select or enter a reason');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm(finalReason.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">❌</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Mark as LOST</h2>
            <p className="text-sm text-gray-500">{leadName}</p>
          </div>
        </div>

        {/* Reason chips */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Reason <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {LOST_REASONS.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => { setReason(r); setError(''); }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                  ${reason === r
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-red-400'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Custom reason */}
        {reason === 'Other' && (
          <div className="mb-4">
            <input
              type="text"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="Describe the reason..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        )}

        {error && (
          <p className="text-red-600 text-xs mb-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300
                       rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-6 py-2 text-sm font-medium text-white bg-red-600
                       rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? 'Processing...' : 'Confirm LOST'}
          </button>
        </div>
      </div>
    </div>
  );
}
