'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  calculateRedMarkDeduction,
  generatePreviewRows,
  DEFAULT_PAYROLL_POLICY,
  type PayrollPolicy,
} from '@/lib/payroll-deduction';

export default function PayrollPolicyPage() {
  const router = useRouter();
  const [policy, setPolicy] = useState<PayrollPolicy>(DEFAULT_PAYROLL_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/payroll-policy');
        if (res.ok) {
          const data = await res.json();
          setPolicy({
            red_mark_threshold: data.red_mark_threshold ?? 6,
            band1_rate_days: Number(data.band1_rate_days ?? 0.5),
            band1_per_marks: data.band1_per_marks ?? 3,
            band1_max_marks: data.band1_max_marks ?? 6,
            band2_rate_days: Number(data.band2_rate_days ?? 1.0),
            band2_per_marks: data.band2_per_marks ?? 3,
            band2_max_marks: data.band2_max_marks ?? 12,
            band3_rate_days: Number(data.band3_rate_days ?? 0.5),
            band3_per_marks: data.band3_per_marks ?? 1,
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function updateField<K extends keyof PayrollPolicy>(key: K, value: number) {
    setPolicy(p => ({ ...p, [key]: value }));
    setSavedMessage(null);
    setErrorMessage(null);
  }

  async function save() {
    setSaving(true);
    setSavedMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/settings/payroll-policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });
      if (res.ok) {
        setSavedMessage('Saved.');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMessage(data.error || 'Failed to save');
      }
    } catch (e: any) {
      setErrorMessage(e.message);
    } finally {
      setSaving(false);
    }
  }

  function resetToDefaults() {
    if (!confirm('Reset all fields to spec defaults? Unsaved changes will be lost.')) return;
    setPolicy(DEFAULT_PAYROLL_POLICY);
  }

  const preview = generatePreviewRows(policy);

  if (loading) {
    return (
      <div className="max-w-3xl">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Red Mark Policy</h1>
        <p className="text-sm text-gray-600 mt-1">
          Configure how monthly red marks translate into salary deductions.
          The forgiveness threshold protects employees who occasionally run late.
          Above the threshold, the full 3-band formula applies (including marks 1–6).
        </p>
      </div>

      {/* Forgiveness Threshold */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Forgiveness Threshold</h3>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={999}
            value={policy.red_mark_threshold}
            onChange={e => updateField('red_mark_threshold', parseInt(e.target.value) || 0)}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <span className="text-sm text-gray-600">marks per month</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          At or below this value → no deduction. Above it → full spec applies including marks 1–6.
        </p>
      </div>

      {/* Spec Formula */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Spec Formula (Advanced)</h3>
        <p className="text-xs text-gray-500 mb-4">
          You normally don&apos;t need to change these — they match the master policy document.
        </p>

        <div className="space-y-4">
          <BandRow
            label="Band 1 (low marks)"
            perMarks={policy.band1_per_marks}
            rateDays={policy.band1_rate_days}
            maxMarks={policy.band1_max_marks}
            onPerMarks={v => updateField('band1_per_marks', v)}
            onRateDays={v => updateField('band1_rate_days', v)}
            onMaxMarks={v => updateField('band1_max_marks', v)}
          />
          <BandRow
            label="Band 2 (mid marks)"
            perMarks={policy.band2_per_marks}
            rateDays={policy.band2_rate_days}
            maxMarks={policy.band2_max_marks}
            onPerMarks={v => updateField('band2_per_marks', v)}
            onRateDays={v => updateField('band2_rate_days', v)}
            onMaxMarks={v => updateField('band2_max_marks', v)}
          />
          <BandRow
            label="Band 3 (high marks, no cap)"
            perMarks={policy.band3_per_marks}
            rateDays={policy.band3_rate_days}
            maxMarks={null}
            onPerMarks={v => updateField('band3_per_marks', v)}
            onRateDays={v => updateField('band3_rate_days', v)}
            onMaxMarks={() => {}}
          />
        </div>
      </div>

      {/* Live Preview */}
      <div className="border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Live Preview</h3>
        <p className="text-xs text-gray-500 mb-3">
          Deduction days for sample monthly mark counts with the current settings.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500">
                <th className="text-left py-2 font-medium">Marks</th>
                <th className="text-left py-2 font-medium">Deduction (days)</th>
                <th className="text-left py-2 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {preview.map(row => (
                <tr key={row.marks} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 font-medium">{row.marks}</td>
                  <td className="py-2">{row.days === 0 ? '—' : `${row.days} day${row.days === 1 ? '' : 's'}`}</td>
                  <td className="py-2 text-xs text-gray-600">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save / Reset */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-[#1D9E75] text-white text-sm font-medium hover:bg-[#178162] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          onClick={resetToDefaults}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          Reset to spec defaults
        </button>
        {savedMessage && (
          <span className="text-sm text-green-700">{savedMessage}</span>
        )}
        {errorMessage && (
          <span className="text-sm text-red-700">{errorMessage}</span>
        )}
      </div>

      <p className="text-xs text-gray-400 mt-2">
        Changes are logged in payroll_settings_history. Override per-employee from the employee profile.
      </p>
    </div>
  );
}

function BandRow({
  label,
  perMarks,
  rateDays,
  maxMarks,
  onPerMarks,
  onRateDays,
  onMaxMarks,
}: {
  label: string;
  perMarks: number;
  rateDays: number;
  maxMarks: number | null;
  onPerMarks: (v: number) => void;
  onRateDays: (v: number) => void;
  onMaxMarks: (v: number) => void;
}) {
  return (
    <div>
      <p className="text-xs text-gray-600 mb-2 font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Every</span>
        <input
          type="number"
          min={1}
          max={99}
          value={perMarks}
          onChange={e => onPerMarks(parseInt(e.target.value) || 1)}
          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
        />
        <span>marks =</span>
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={rateDays}
          onChange={e => onRateDays(parseFloat(e.target.value) || 0)}
          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
        />
        <span>day{rateDays === 1 ? '' : 's'}</span>
        {maxMarks !== null && (
          <>
            <span className="text-gray-400">·</span>
            <span>up to</span>
            <input
              type="number"
              min={1}
              max={999}
              value={maxMarks}
              onChange={e => onMaxMarks(parseInt(e.target.value) || 1)}
              className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
            />
            <span>marks</span>
          </>
        )}
      </div>
    </div>
  );
}
