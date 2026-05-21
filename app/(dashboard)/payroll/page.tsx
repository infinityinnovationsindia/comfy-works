
'use client';
import { useState } from 'react';

export default function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [downloading, setDownloading] = useState(false);

  async function downloadReport() {
    setDownloading(true);
    const res = await fetch(`/api/payroll/report?month=${month}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `payroll-${month}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloading(false);
  }

  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Payroll Report</h1>

      <div className="bg-white border rounded-xl p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Select Month</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="border rounded-lg px-4 py-2.5 text-sm w-full" />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm text-gray-600">
          <p className="font-medium text-gray-800 mb-2">Report includes per employee:</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Days Present, PL used, UL days, Holidays, Absents</li>
            <li>AAA count + deduction (3 days each)</li>
            <li>AA count + deduction (2 days each)</li>
            <li>Red mark count + ₹ deduction (Section 6 formula)</li>
            <li>Loan deduction (if active loan)</li>
            <li>Net working days</li>
          </ul>
        </div>

        <button onClick={downloadReport} disabled={downloading}
          className="w-full py-3 bg-green-700 text-white rounded-lg font-medium disabled:opacity-60 flex items-center justify-center gap-2">
          {downloading ? 'Generating...' : (
            <>
              <span>📊</span>
              Download Payroll Report — {month}
            </>
          )}
        </button>

        <p className="text-xs text-gray-400 mt-3 text-center">
          Excel file ready for Kiran/Neal in accounts
        </p>
      </div>

      {/* Year-end actions (show in March) */}
      {new Date().getMonth() === 2 && (
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h2 className="font-semibold text-amber-900 mb-2">⚠️ March Year-End Actions</h2>
          <p className="text-sm text-amber-800 mb-4">
            April 1 is approaching. All unused PL balances will lapse on March 31.
            NO encashment — this is permanent company policy.
          </p>
          <button onClick={async () => {
            if (!confirm('Zero all PL balances for FY end? This cannot be undone.')) return;
            await fetch('/api/cron/year-end', { method: 'GET', headers: { 'x-cron-secret': 'admin' } });
            alert('Year-end processing complete.');
          }} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium">
            Run Year-End PL Lapse
          </button>
        </div>
      )}
    </div>
  );
}
