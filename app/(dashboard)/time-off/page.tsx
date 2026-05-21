
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function TimeOffPage() {
  const [perms, setPerms] = useState<any[]>([]);
  const [date, setDate]   = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/time-off?date=${date}`).then(r => r.json()).then(d => { setPerms(d); setLoading(false); });
  }, [date]);

  const STATUS: Record<string,string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Returned: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Time Off Permissions</h1>
        <Link href="/time-off/apply" className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm font-medium">
          + New Request
        </Link>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">Date:</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
      </div>
      {loading ? <div className="text-center py-12 text-gray-400">Loading...</div> : perms.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No time-off permissions for this date.</div>
      ) : (
        <div className="space-y-3">
          {perms.map(p => (
            <div key={p.id} className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{p.employee?.first_name} {p.employee?.last_name}
                    <span className="text-gray-400 text-sm ml-2">{p.employee?.employee_no}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Out: <strong>{p.time_out}</strong>
                    {p.time_in_expected && <span> · Expected back: <strong>{p.time_in_expected}</strong></span>}
                    {p.time_in_actual  && <span> · Returned: <strong>{p.time_in_actual}</strong></span>}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{p.purpose}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
