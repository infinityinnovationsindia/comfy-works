
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function OnDutyPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/on-duty').then(r => r.json()).then(d => { setRecords(d); setLoading(false); });
  }, []);

  const STATUS: Record<string,string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Returned: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">On Duty — Official Movement</h1>
        <Link href="/on-duty/apply" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New On Duty
        </Link>
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : records.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No on duty records.</div>
      ) : (
        <div className="space-y-3">
          {records.map(r => (
            <div key={r.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{r.employee?.first_name} {r.employee?.last_name}
                    <span className="text-gray-400 text-sm ml-2">{r.employee?.employee_no}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {r.date} · Out: {r.time_out ?? '?'} · Location: {r.location_to_visit}
                  </div>
                  <div className="text-sm text-gray-500">{r.purpose}</div>
                  {r.vehicle_type && <div className="text-xs text-gray-400">{r.vehicle_type}: {r.vehicle_number}</div>}
                  {r.outward_km && <div className="text-xs text-gray-400">KM Out: {r.outward_km}{r.inward_km ? ` · In: ${r.inward_km} · Total: ${r.total_km}` : ''}</div>}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS[r.status] ?? 'bg-gray-100'}`}>{r.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
