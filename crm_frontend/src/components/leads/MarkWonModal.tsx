'use client';
import { useState } from 'react';

interface Props {
  leadName: string;
  defaultValue?: number | null;
  onConfirm: (wonAmount: number | undefined) => Promise<void>;
  onClose: () => void;
}

export default function MarkWonModal({ leadName, defaultValue, onConfirm, onClose }: Props) {
  const [amount, setAmount] = useState<string>(defaultValue?.toString() ?? '');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(amount ? Number(amount) : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-3xl">🎉</span>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Mark as WON</h2>
            <p className="text-sm text-gray-500">{leadName}</p>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-5 text-sm text-green-700">
          ✅ A <strong>Customer profile</strong> will be created automatically
          from this lead's data.
        </div>

        {/* Amount input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Won Amount (EGP) <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="e.g. 15000"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
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
            className="px-6 py-2 text-sm font-medium text-white bg-green-600
                       rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Processing...' : '🏆 Confirm WON'}
          </button>
        </div>
      </div>
    </div>
  );
}
