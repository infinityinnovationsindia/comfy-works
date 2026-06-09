'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  employeeId: string;
  employeeName: string;
  globalThreshold: number;
  currentOverride: number | null;
  currentReason: string | null;
  setAt: string | null;
  setByName: string | null;
  canEdit: boolean;
};

export default function RedMarkOverrideCard({
  employeeId,
  employeeName,
  globalThreshold,
  currentOverride,
  currentReason,
  setAt,
  setByName,
  canEdit,
}: Props) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [threshold, setThreshold] = useState<number>(currentOverride ?? globalThreshold);
  const [reason, setReason] = useState(currentReason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOverride = currentOverride != null;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/red-mark-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold, reason }),
      });
      if (res.ok) {
        setModalOpen(false);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Save failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm('Remove the red mark override and revert this employee to standard policy?')) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/employees/${employeeId}/red-mark-override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: null, reason: null }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Remove failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="border border-gray-200 rounded-xl p-4 md:p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-100">
          Red Mark Policy
        </h3>

        {hasOverride ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                Custom threshold
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Threshold</p>
                <p className="text-sm text-gray-900 font-medium">{currentOverride} marks</p>
              </div>
              <div className="col-span-2 md:col-span-3">
                <p className="text-xs text-gray-500 mb-0.5">Reason</p>
                <p className="text-sm text-gray-900">{currentReason || '—'}</p>
              </div>
              <div className="col-span-full">
                <p className="text-xs text-gray-400">
                  Set {setAt ? new Date(setAt).toLocaleDateString('en-IN') : ''}
                  {setByName ? ` by ${setByName}` : ''} ·
                  Global default is {globalThreshold} marks.
                </p>
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setThreshold(currentOverride ?? globalThreshold); setReason(currentReason ?? ''); setModalOpen(true); }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={remove}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg border border-red-300 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove override
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
                Standard policy
              </span>
            </div>
            <p className="text-sm text-gray-600">
              Using the global threshold of <b>{globalThreshold} marks</b>. Above this, deduction applies per the spec formula.
            </p>
            {canEdit && (
              <button
                onClick={() => { setThreshold(globalThreshold); setReason(''); setModalOpen(true); }}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Set custom threshold
              </button>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white rounded-xl p-6 max-w-md w-full"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-1">Set red mark threshold</h2>
            <p className="text-sm text-gray-600 mb-4">for {employeeName}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-700 font-medium mb-1">
                  Custom threshold (marks)
                </label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={threshold}
                  onChange={e => setThreshold(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Global default: {globalThreshold}. Set higher to be lenient.
                  Above this number, the full spec applies including marks 1–6.
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-700 font-medium mb-1">
                  Reason (visible in audit log)
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder="e.g., Brings factory keys from home before shift starts"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-700 mt-3">{error}</p>
            )}

            <div className="flex gap-2 mt-6 justify-end">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#178162] disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
